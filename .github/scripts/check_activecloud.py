"""Compare GitHub's FTP credentials with a known working local login."""

import argparse
import hashlib
import hmac
import os
import re
import secrets

from deploy_activecloud import connect_ftps, environment_credentials, login


def credential_checks(salt, username, password):
    """Use independent salts so the two fields can be compared without exposing either."""
    return tuple(
        hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt + field, 600_000).hex()
        for field, value in ((b"username", username), (b"password", password))
    )


def make_reference(username, password):
    """Generate a fresh local reference for the temporary FTP_CHECK environment secret."""
    salt = secrets.token_bytes(16)
    return ":".join(("v1", salt.hex(), *credential_checks(salt, username, password)))


def compare_reference(reference, username, password):
    """Report exact field matches; malformed references must never appear in logs."""
    match = re.fullmatch(r"v1:([0-9a-f]{32}):([0-9a-f]{64}):([0-9a-f]{64})", reference)
    if not match:
        raise RuntimeError("FTP_CHECK is missing or invalid. Copy the complete local reference.")
    expected_user, expected_password = match[2], match[3]
    actual_user, actual_password = credential_checks(bytes.fromhex(match[1]), username, password)
    return (
        hmac.compare_digest(actual_user, expected_user),
        hmac.compare_digest(actual_password, expected_password),
    )


def check_environment():
    """Check the GitHub environment and attempt one login only with matching credentials."""
    username, password = environment_credentials()
    user_ok, password_ok = compare_reference(os.environ.get("FTP_CHECK", ""), username, password)
    print(f"FTP_USERNAME: {'MATCH' if user_ok else 'MISMATCH'}", flush=True)
    print(f"FTP_PASSWORD: {'MATCH' if password_ok else 'MISMATCH'}", flush=True)
    with connect_ftps() as ftp:
        if not (user_ok and password_ok):
            raise RuntimeError("FTP login skipped: credentials differ from the successful local login.")
        login(ftp, username, password)


def prepare_locally():
    """Use local paste-friendly dialogs; only a reference from a successful login is copied."""
    import tkinter as tk
    from tkinter import messagebox, simpledialog

    root = tk.Tk()
    root.withdraw()
    try:
        username = simpledialog.askstring("ActiveCloud FTPS", "FTP username:", parent=root)
        if not username:
            return
        password = simpledialog.askstring("ActiveCloud FTPS", "FTP password:", show="*", parent=root)
        if not password:
            return
        with connect_ftps() as ftp:
            login(ftp, username, password)
        reference = make_reference(username, password)
        root.clipboard_clear()
        root.clipboard_append(reference)
        messagebox.showinfo(
            "FTP_CHECK",
            "Login succeeded. The FTP_CHECK reference is on the clipboard.\n\n"
            "Paste it into GitHub: Settings > Environments > FTP > Add environment secret. "
            "Name it FTP_CHECK, save it, then close this window.",
            parent=root,
        )
    finally:
        root.destroy()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", action="store_true", help="verify the local login and copy FTP_CHECK")
    mode.add_argument("--check", action="store_true", help="diagnose the GitHub FTP environment")
    args = parser.parse_args()
    try:
        if args.prepare:
            prepare_locally()
        else:
            check_environment()
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
