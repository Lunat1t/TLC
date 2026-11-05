#!/usr/bin/env python3
"""Install the TLC Google service-account JSON into ignored .env.local safely."""

import json
import os
import sys
import tempfile
from pathlib import Path


EXPECTED_EMAIL = "tlc-instructions-uploader@reflected-oath-417810.iam.gserviceaccount.com"
ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/import_google_drive_service_account.py /path/to/service-account.json")
        return 2

    key_path = Path(sys.argv[1]).expanduser().resolve()
    try:
        account = json.loads(key_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Cannot read service-account JSON: {error}")
        return 2

    email = account.get("client_email")
    private_key = account.get("private_key")
    if account.get("type") != "service_account" or email != EXPECTED_EMAIL or not isinstance(private_key, str):
        print("The JSON does not match the TLC upload service account; .env.local was not changed.")
        return 2

    if not ENV_PATH.exists():
        print(".env.local was not found; .env.local was not changed.")
        return 2

    lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    replacements = {
        "GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL": email,
        "GOOGLE_DRIVE_PRIVATE_KEY": json.dumps(private_key),
    }
    output = []
    seen = set()
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line else None
        if key in replacements:
            if key not in seen:
                output.append(f"{key}={replacements[key]}")
                seen.add(key)
        else:
            output.append(line)
    for key, value in replacements.items():
        if key not in seen:
            output.append(f"{key}={value}")

    payload = "\n".join(output) + "\n"
    fd, temp_name = tempfile.mkstemp(prefix=".env.local.", dir=ENV_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as target:
            target.write(payload)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, ENV_PATH)
        os.chmod(ENV_PATH, 0o600)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    print(f"Installed Drive credentials for {email} in .env.local (permissions 600). Private key was not printed.")
    print("Delete the downloaded JSON key file after confirming the local setup.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
