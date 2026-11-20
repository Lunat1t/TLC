import { execFileSync, spawn } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { isIPv4 } from "node:net"
import { homedir, networkInterfaces } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { host: { type: "string" }, port: { type: "string", default: "3443" } } })
const root = fileURLToPath(new URL("../", import.meta.url))

function privateAddress(address) {
  const [first, second] = address.split(".").map(Number)
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

const addresses = Object.values(networkInterfaces()).flat()
  .filter(entry => entry?.family === "IPv4" && !entry.internal && privateAddress(entry.address))
  .map(entry => entry.address)
const host = values.host ?? addresses[0]
const port = Number(values.port)

if (!host || !isIPv4(host) || (!addresses.includes(host) && host !== "127.0.0.1")) {
  throw new Error("Укажите локальный IPv4 компьютера: npm run dev:lan -- --host <адрес>")
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Нужен порт от 1024 до 65535.")
}

const config = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "brick-studio", "display-lan")
const ca = join(config, "ca")
const keyName = "rootCA.key"
const pemName = "rootCA.pem"
const certName = "rootCA.cer"
const profileName = "BrickStudio-LAN.mobileconfig"
const serial = () => `0x01${randomBytes(15).toString("hex")}`

function openssl(args) {
  try {
    execFileSync("openssl", args, { stdio: ["ignore", "ignore", "pipe"] })
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Для локального HTTPS установите OpenSSL.")
    throw new Error(error.stderr?.toString().trim() || "OpenSSL не смог подготовить сертификат.")
  }
}

async function writeAppleProfile(directory) {
  const certificate = await readFile(join(directory, certName))
  const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>local.brickstudio.display</string>
  <key>PayloadUUID</key><string>${randomUUID()}</string>
  <key>PayloadDisplayName</key><string>Brick Studio Local Display</string>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key><string>com.apple.security.root</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>local.brickstudio.display.root</string>
      <key>PayloadUUID</key><string>${randomUUID()}</string>
      <key>PayloadCertificateFileName</key><string>${certName}</string>
      <key>PayloadContent</key><data>${certificate.toString("base64")}</data>
    </dict>
  </array>
</dict>
</plist>
`
  await writeFile(join(directory, profileName), profile, { mode: 0o644 })
}

async function ensureRootCa() {
  try {
    await stat(ca)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    const staged = await mkdtemp(join(config, "ca-"))
    try {
      openssl([
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1825",
        "-set_serial", serial(), "-subj", "/CN=Brick Studio Local Display",
        "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign",
        "-keyout", join(staged, keyName), "-out", join(staged, pemName),
      ])
      openssl(["x509", "-in", join(staged, pemName), "-outform", "DER", "-out", join(staged, certName)])
      await writeAppleProfile(staged)
      try {
        await rename(staged, ca)
      } catch (error) {
        if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error
      }
    } finally {
      await rm(staged, { recursive: true, force: true })
    }
  }

  await chmod(ca, 0o700)
  await chmod(join(ca, keyName), 0o600)
  await stat(join(ca, certName))
  openssl(["x509", "-in", join(ca, pemName), "-checkend", "86400", "-noout"])
}

await mkdir(config, { recursive: true, mode: 0o700 })
await chmod(config, 0o700)
await ensureRootCa()

const current = await mkdtemp(join(config, "server-"))
try {
  const key = join(current, "server.key")
  const cert = join(current, "server.pem")
  const csr = join(current, "server.csr")
  const extensions = join(current, "extensions.cnf")
  await writeFile(extensions, [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    `subjectAltName=IP:${host}${host === "127.0.0.1" ? ",DNS:localhost" : ""}`,
  ].join("\n"))
  openssl([
    "req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-subj", "/CN=Brick Studio Display", "-keyout", key, "-out", csr,
  ])
  openssl([
    "x509", "-req", "-in", csr, "-CA", join(ca, pemName), "-CAkey", join(ca, keyName),
    "-set_serial", serial(), "-sha256", "-days", "90", "-extfile", extensions, "-out", cert,
  ])
  openssl(["verify", "-purpose", "sslserver", "-verify_ip", host, "-CAfile", join(ca, pemName), cert])

  console.log(`Brick Studio: https://${host}:${port}`)
  console.log(`Android / компьютер — открытый сертификат: ${join(ca, certName)}`)
  console.log(`iPhone / iPad — профиль сертификата: ${join(ca, profileName)}`)
  console.log("Инструкция: docs/display-lan.md")

  const next = spawn(process.execPath, [
    join(root, "node_modules", "next", "dist", "bin", "next"),
    "dev", "--hostname", host, "--port", String(port), "--experimental-https",
    "--experimental-https-key", key, "--experimental-https-cert", cert,
  ], { cwd: root, stdio: "inherit", env: { ...process.env, BRICK_STUDIO_LAN_DEV: "1" } })

  const stop = signal => next.kill(signal)
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      next.once("error", reject)
      next.once("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 143)))
    })
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
  }
} finally {
  await rm(current, { recursive: true, force: true })
}
