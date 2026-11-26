"""Publish the Vite build through the site-scoped ActiveCloud FTPS account."""

import ftplib
import hashlib
import io
import os
from contextlib import contextmanager
from pathlib import Path
import re
import ssl
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import uuid4


FTP_HOST = "ldvdetailing.pro"
# Enrolled on the first connection. Review a replacement before updating this pin.
CERT_SHA256 = "2cea5bca80f23390c0a0c4e668dcd430db228911435887e2154dd06cabc76565"
SITE = "https://ldvdetailing.pro"
BUILD = Path("dist")


def verify_peer(connection):
    """Require the enrolled certificate on both the control and file connections."""
    certificate = connection.getpeercert(binary_form=True)
    if hashlib.sha256(certificate).hexdigest() != CERT_SHA256:
        raise ssl.SSLCertVerificationError("ActiveCloud FTPS certificate fingerprint has changed")


class ActiveCloudFTPS(ftplib.FTP_TLS):
    def auth(self):
        """Check the server immediately after AUTH TLS, before FTP login."""
        response = super().auth()
        verify_peer(self.sock)
        return response

    def ntransfercmd(self, cmd, rest=None):
        """Reuse the authenticated TLS session for Pure-FTPd data transfers."""
        raw, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        with raw:
            secure = self.context.wrap_socket(
                raw, server_hostname=self.host, session=self.sock.session
            )
        try:
            verify_peer(secure)
        except BaseException:
            secure.close()
            raise
        return secure, size


@contextmanager
def ftp_stage(label):
    """Report the failing stage without echoing server replies or credential values."""
    try:
        yield
    except ssl.SSLCertVerificationError:
        raise RuntimeError(f"{label}: server certificate does not match the pin") from None
    except ftplib.Error as error:
        match = re.match(r"^([0-9]{3})(?:[ -]|$)", str(error))
        status = match[1] if match else "invalid reply"
        raise RuntimeError(f"{label}: FTP {status}") from None
    except HTTPError as error:
        raise RuntimeError(f"{label}: HTTP {error.code}") from None
    except (OSError, EOFError, ValueError) as error:
        raise RuntimeError(f"{label}: {type(error).__name__}") from None


@contextmanager
def connect_ftps():
    """Open the same pinned control connection for diagnostics and production uploads."""
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE  # verify_peer checks the exact self-signed certificate.
    ftp = ActiveCloudFTPS(context=context, timeout=45)
    try:
        print(f"Connecting to {FTP_HOST}:21", flush=True)
        with ftp_stage("FTP connection"):
            ftp.connect(FTP_HOST, 21)
        print(f"Remote FTP address: {ftp.sock.getpeername()[0]}", flush=True)
        with ftp_stage("AUTH TLS"):
            ftp.auth()
        print(f"FTPS certificate: MATCH ({ftp.sock.version()})", flush=True)
        yield ftp
    finally:
        ftp.close()


def login(ftp, username, password):
    """Log the FTP status code only. A server can include the username in its reply."""
    with ftp_stage("FTP login"):
        response = ftp.login(username, password)
        print(f"FTP login: {int(response[:3])}", flush=True)


def environment_credentials():
    """Read the exact values injected by the FTP environment, without trimming them."""
    for name in ("FTP_USERNAME", "FTP_PASSWORD"):
        if not os.environ.get(name):
            raise RuntimeError(f"Missing or empty {name} in the FTP environment")
    return os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"]


def public_file(path):
    """Read a fresh copy from the public website using its normal HTTPS certificate."""
    url = f"{SITE}/{quote(path)}?deploy-check={uuid4().hex}"
    request = Request(url, headers={"Cache-Control": "no-cache", "Accept-Encoding": "identity"})
    with urlopen(request, timeout=30) as response:
        return response.read()


def upload(ftp, path):
    """Keep each previous file available until its replacement finishes uploading."""
    relative = path.relative_to(BUILD)
    temporary = (relative.parent / f".{relative.name}.deploying").as_posix()
    with path.open("rb") as source:
        ftp.storbinary(f"STOR {temporary}", source, blocksize=128 * 1024)
    ftp.rename(temporary, relative.as_posix())


def publish(ftp):
    """Upload assets, verify the public bundles, then switch the homepage."""
    print("Checking the FTP home against the public homepage", flush=True)
    current = io.BytesIO()
    ftp.retrbinary("RETR index.html", current.write)
    if current.getvalue() != public_file(""):
        raise RuntimeError(
            "FTP index.html differs from the live homepage. Check the FTP home directory."
        )

    root = ftp.pwd()
    index = BUILD / "index.html"
    expected_index = index.read_bytes()
    print("FTP home verified. Uploading build assets", flush=True)
    for path in sorted(BUILD.rglob("*")):
        relative = path.relative_to(BUILD).as_posix()
        if path.is_dir():
            try:
                ftp.mkd(relative)
            except ftplib.error_perm:
                # MKD also fails for existing directories. Confirm this one is accessible.
                ftp.cwd(relative)
                ftp.cwd(root)
        elif path != index:
            upload(ftp, path)

    print("Verifying the published JavaScript and CSS over HTTPS", flush=True)
    for path in sorted((BUILD / "assets").rglob("*")):
        if path.suffix in {".css", ".js"}:
            relative = path.relative_to(BUILD).as_posix()
            if public_file(relative) != path.read_bytes():
                raise RuntimeError(f"Public build asset differs from {path}")

    print("Publishing index.html and checking the public homepage", flush=True)
    upload(ftp, index)
    if public_file("") != expected_index:
        raise RuntimeError("The public homepage differs from the deployed build")
    print(f"Verified the deployed homepage and bundles at {SITE}/")


def main():
    """Connect using the GitHub environment secrets and the recorded certificate."""
    username, password = environment_credentials()
    with connect_ftps() as ftp:
        login(ftp, username, password)
        with ftp_stage("Protect data channel"):
            ftp.prot_p()
        with ftp_stage("Publish site"):
            publish(ftp)


if __name__ == "__main__":
    main()
