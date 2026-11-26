"""Publish the Vite build through the site-scoped ActiveCloud FTPS account."""

import ftplib
import hashlib
import io
import os
from pathlib import Path
import ssl
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
        raise ssl.SSLError("ActiveCloud FTPS certificate fingerprint has changed")


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
    current = io.BytesIO()
    ftp.retrbinary("RETR index.html", current.write)
    if current.getvalue() != public_file(""):
        raise RuntimeError(
            "FTP index.html differs from the live homepage. Check the FTP home directory."
        )

    root = ftp.pwd()
    index = BUILD / "index.html"
    expected_index = index.read_bytes()
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

    for path in sorted((BUILD / "assets").rglob("*")):
        if path.suffix in {".css", ".js"}:
            relative = path.relative_to(BUILD).as_posix()
            if public_file(relative) != path.read_bytes():
                raise RuntimeError(f"Public build asset differs from {path}")

    upload(ftp, index)
    if public_file("") != expected_index:
        raise RuntimeError("The public homepage differs from the deployed build")
    print(f"Verified the deployed homepage and bundles at {SITE}/")


def main():
    """Connect using the GitHub environment secrets and the recorded certificate."""
    username = os.environ.get("FTP_USERNAME")
    password = os.environ.get("FTP_PASSWORD")
    if not username or not password:
        raise RuntimeError("Set FTP_USERNAME and FTP_PASSWORD in the FTP environment on GitHub")

    # This host uses a self-signed certificate. verify_peer authenticates its exact DER bytes.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    with ActiveCloudFTPS(context=context, timeout=45) as ftp:
        ftp.connect(FTP_HOST, 21)
        ftp.auth()
        ftp.login(username, password)
        ftp.prot_p()
        publish(ftp)


if __name__ == "__main__":
    main()
