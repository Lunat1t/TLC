// Gesture model: InputBlackBoxOutput/Rock-Paper-Scissors (MIT, see LICENSE).
const assets = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/"
const video = document.querySelector("video")
const timer = document.querySelector("output")
const start = document.querySelector("#round")
const message = document.querySelector("#message")
const choices = document.querySelector("#choices")
const moves = ["R", "S", "P"]
const icons = { R: "✊", S: "✌️", P: "✋" }
const beats = { R: "S", S: "P", P: "R" }
let stream, hands, tick, latest
let stopped = false
let lastSeen = 0, playerScore = 0, computerScore = 0

function stop() {
  stopped = true
  clearInterval(tick)
  stream?.getTracks().forEach(track => track.stop())
  video.srcObject = null
}
window.addEventListener("pagehide", stop)
function script(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script")
    tag.src = src
    tag.onload = resolve
    tag.onerror = reject
    document.head.append(tag)
  })
}
async function prepare() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal:"user"}, width:{ideal:640}, height:{ideal:480}}})
    if (stopped) { stop(); return }
    video.srcObject = stream
    await Promise.all([video.play(), script("rfc.js"), script(assets + "hands.js")])
    if (stopped) return
    hands = new Hands({ locateFile: file => assets + file })
    hands.setOptions({ selfieMode:true, maxNumHands:1, modelComplexity:0, minDetectionConfidence:0.65, minTrackingConfidence:0.65 })
    hands.onResults(results => {
      const points = results.multiHandLandmarks?.[0]
      latest = points ? randomForestClassifier(points) : null
      lastSeen = performance.now()
    })
    await hands.send({ image:video })
    if (stopped) return
    start.disabled = false
    message.textContent = "Покажи ✊, ✌️ или ✋"
    while (!stopped) {
      await new Promise(requestAnimationFrame)
      if (!stopped && video.readyState >= 2) await hands.send({image:video})
    }
  } catch (error) {
    if (stopped) return
    stop()
    start.disabled = false
    start.textContent = "Попробовать снова"
    message.textContent = error?.name === "NotAllowedError" ? "Разреши доступ к камере." : "Проверь камеру и подключение."
    timer.textContent = ""
  }
}
start.onclick = () => {
  if (stopped) { location.reload(); return }
  start.disabled = true
  choices.hidden = true
  const computer = moves[Math.floor(Math.random() * moves.length)]
  let seconds = 3
  message.textContent = "Покажи свой ход!"
  timer.textContent = seconds
  tick = setInterval(() => {
    seconds--
    timer.textContent = seconds || ""
    if (seconds) return
    clearInterval(tick)
    start.disabled = false
    start.textContent = "Ещё раунд"
    if (!moves.includes(latest) || performance.now() - lastSeen > 900) {
      message.textContent = "Не видно жест. Попробуем ещё?"
      return
    }
    const player = latest
    const won = beats[player] === computer
    if (won) playerScore++
    else if (player !== computer) computerScore++
    choices.hidden = false
    choices.textContent = "Ты " + icons[player] + " · " + icons[computer] + " Компьютер"
    message.textContent = player === computer ? "Ничья!" : won ? "Твоя победа!" : "Компьютер победил"
    document.querySelector("#score").textContent = "Ты " + playerScore + " · " + computerScore + " Компьютер"
  }, 1000)
}
prepare()
