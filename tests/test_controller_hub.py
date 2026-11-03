"""Offline safety check for the downloadable Pybricks program (protocol v3)."""
import contextlib
import io
import runpy
import sys
import types
from pathlib import Path


class EndSimulation(Exception):
    pass


now = 0
motors = {}
input_bytes = list(
    b"m,Z,300\n"
    b"m,A,1001\n"
    b"m,A,800\n"
    b"d,A,75\n"
    b"a,A,500,360\n"
    b"t,A,400,1000\n"
    b"m,A,400\n"
    b"k\n"
)


class Motor:
    def __init__(self, port):
        if port not in ("A", "D"):
            raise OSError("No motor")
        self.port = port
        self.calls = []
        motors[port] = self

    def run(self, speed):
        self.calls.append(("run", speed))

    def dc(self, power):
        self.calls.append(("dc", power))

    def run_angle(self, speed, angle, then=None, wait=False):
        self.calls.append(("run_angle", speed, angle, then, wait))

    def run_time(self, speed, ms, then=None, wait=False):
        self.calls.append(("run_time", speed, ms, then, wait))

    def brake(self):
        self.calls.append(("brake",))


class StopWatch:
    def time(self):
        return now


def read_input_byte():
    return input_bytes.pop(0) if input_bytes else None


def wait(ms):
    global now
    now += ms
    if now > 900:
        raise EndSimulation


pybricks = types.ModuleType("pybricks")
pybricks.__path__ = []
devices = types.ModuleType("pybricks.pupdevices")
devices.Motor = Motor
parameters = types.ModuleType("pybricks.parameters")
parameters.Port = type("Port", (), {name: name for name in "ABCDEF"})
parameters.Stop = type("Stop", (), {"BRAKE": "BRAKE", "COAST": "COAST", "HOLD": "HOLD"})
tools = types.ModuleType("pybricks.tools")
tools.StopWatch = StopWatch
tools.wait = wait
tools.read_input_byte = read_input_byte
sys.modules.update({
    "pybricks": pybricks,
    "pybricks.pupdevices": devices,
    "pybricks.parameters": parameters,
    "pybricks.tools": tools,
})
output = io.StringIO()
with contextlib.redirect_stdout(output):
    try:
        runpy.run_path(str(Path(__file__).parents[1] / "public" / "hub_program.py"))
    except EndSimulation:
        pass

out = output.getvalue()
assert "SOCER3_READY|A,D" in out, f"Unexpected ready output: {out}"
assert "SOCER2_ACK" in out
assert "SOCER2_LINK_LOST" in out
assert motors["A"].calls == [
    ("run", 800),
    ("dc", 75),
    ("run_angle", 500, 360, "BRAKE", False),
    ("run_time", 400, 1000, "BRAKE", False),
    ("run", 400),
    ("brake",),
], f"Unexpected calls: {motors['A'].calls}"
assert not motors["D"].calls
print("controller hub simulation passed")
