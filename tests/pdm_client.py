#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Small PDM API and node-shell client for the NS8 module tests (stdlib only).

  PDM_PASSWORD=... pdm_client.py [--host HEADER] BASE_URL api METHOD PATH [key=value ...]
  PDM_PASSWORD=... pdm_client.py [--host HEADER] BASE_URL shell

BASE_URL is e.g. https://127.0.0.1:20015 (module port) or http://127.0.0.1
(Traefik). --host sets the Host header, as a browser would for the route.
`api` prints the JSON response body; `shell` opens the node shell through the
websocket (termproxy + vncwebsocket), runs an echo and prints "ws-ok".
"""
import base64, json, os, socket, ssl, sys, urllib.error, urllib.parse, urllib.request

COOKIE = "__Host-PDMAuthCookie"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


class Client:
    def __init__(self, base, host=None):
        self.base, self.host = base.rstrip("/"), host
        self.ticket = self.csrf = None

    def call(self, method, path, data=None):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        req = urllib.request.Request(self.base + path, data=body, method=method)
        if self.host:
            req.add_header("Host", self.host)
        if self.ticket:
            req.add_header("Cookie", COOKIE + "=" + urllib.parse.quote(self.ticket, safe=""))
            req.add_header("CSRFPreventionToken", self.csrf)
        return urllib.request.urlopen(req, context=ctx, timeout=20)

    def login(self, password):
        resp = self.call("POST", "/api2/json/access/ticket", {"username": "root@pam", "password": password})
        self.csrf = json.load(resp)["data"]["CSRFPreventionToken"]
        for header in resp.headers.get_all("Set-Cookie") or []:
            if header.startswith(COOKIE + "="):
                self.ticket = urllib.parse.unquote(header.split(";")[0].split("=", 1)[1])
        if not self.ticket:
            raise SystemExit("login: no ticket cookie")


def frame(payload):
    mask = os.urandom(4)
    return bytes([0x82, 0x80 | len(payload)]) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


def shell(client):
    session = json.load(client.call("POST", "/api2/json/nodes/localhost/termproxy", {}))["data"]
    url = urllib.parse.urlparse(client.base)
    port = url.port or (443 if url.scheme == "https" else 80)
    raw = socket.create_connection((url.hostname, port), timeout=15)
    sock = ctx.wrap_socket(raw, server_hostname=url.hostname) if url.scheme == "https" else raw
    query = urllib.parse.urlencode({"port": session["port"], "vncticket": session["ticket"]})
    sock.sendall((
        f"GET /api2/json/nodes/localhost/vncwebsocket?{query} HTTP/1.1\r\n"
        f"Host: {client.host or url.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\nSec-WebSocket-Version: 13\r\n"
        f"Sec-WebSocket-Protocol: binary\r\n"
        f"Cookie: {COOKIE}={urllib.parse.quote(client.ticket, safe='')}\r\n\r\n").encode())
    head = b""
    while b"\r\n\r\n" not in head:
        chunk = sock.recv(4096)
        if not chunk:
            raise SystemExit("connection closed during handshake")
        head += chunk
    status = head.split(b"\r\n")[0].decode()
    print("handshake:", status)
    if " 101 " not in status:
        raise SystemExit(1)
    buf = head.split(b"\r\n\r\n", 1)[1]
    sock.settimeout(20)

    def need(count):
        nonlocal buf
        while len(buf) < count:
            chunk = sock.recv(65536)
            if not chunk:
                raise EOFError
            buf += chunk

    def read():
        nonlocal buf
        need(2)
        size, header = buf[1] & 0x7F, 2
        if size == 126:
            need(4); size, header = int.from_bytes(buf[2:4], "big"), 4
        elif size == 127:
            need(10); size, header = int.from_bytes(buf[2:10], "big"), 10
        need(header + size)
        data, buf = buf[header:header + size], buf[header + size:]
        return data

    sock.sendall(frame(f"root@pam:{session['ticket']}\n".encode()))
    reply = read()
    print("auth reply:", reply)
    if reply != b"OK":
        raise SystemExit(1)
    command = b"echo ws-$((6*7))\n"
    sock.sendall(frame(b"1:80:24:"))
    sock.sendall(frame(b"0:" + str(len(command)).encode() + b":" + command))
    out = b""
    try:
        while b"ws-42" not in out:
            out += read()
    except (EOFError, socket.timeout):
        pass
    if b"ws-42" not in out:
        raise SystemExit("no shell output")
    print("ws-ok")


def main(argv):
    host = None
    if argv[:1] == ["--host"]:
        host, argv = argv[1], argv[2:]
    base, command, rest = argv[0], argv[1], argv[2:]
    client = Client(base, host)
    client.login(os.environ["PDM_PASSWORD"])
    if command == "shell":
        shell(client)
    elif command == "api":
        method, path = rest[0], rest[1]
        data = dict(item.split("=", 1) for item in rest[2:]) if method != "GET" else None
        try:
            print(client.call(method, path, data).read().decode())
        except urllib.error.HTTPError as err:
            print(err.read().decode(), file=sys.stderr)
            raise SystemExit(f"HTTP {err.code}")
    else:
        raise SystemExit("unknown command")


if __name__ == "__main__":
    main(sys.argv[1:])
