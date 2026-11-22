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
sensors = {}
imu_calls = []
imu_state = {"heading": 90, "tilt": (5, -2)}
input_bytes = list(
    b"m,Z,300\n"
    b"m,A,1001\n"
    b"m,A,800\n"
    b"d,A,75\n"
    b"a,A,500,360\n"
    b"t,A,400,1000\n"
    b"m,A,400\n"
    b"u,C,80\n"
    b"u,C,-1\n"
    b"u,C,150\n"
    b"u,A,50\n"
    b"u,F,50\n"
    b"u,B,60\n"
    b"g,IMU,r\n"
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


class SensorLights:
    def __init__(self, owner):
        self.owner = owner

    def on(self, brightness=100):
        self.owner.light_calls.append(("on", brightness))

    def off(self):
        self.owner.light_calls.append(("off",))


class UltrasonicSensor:
    def __init__(self, port):
        if port not in ("C", "E"):
            raise OSError("No sensor")
        self.port = port
        self.light_calls = []
        self.lights = SensorLights(self)
        sensors[port] = self

    def distance(self):
        if self.port == "E":
            raise OSError("Sensor read error")
        return 180


class ColorSensor:
    def __init__(self, port):
        if port != "B":
            raise OSError("No color sensor")
        self.port = port
        self.light_calls = []
        self.lights = SensorLights(self)
        sensors[port] = self

    def color(self):
        return "COLOR_RED"

    def reflection(self):
        return 42


class ForceSensor:
    def __init__(self, port):
        if port != "F":
            raise OSError("No force sensor")
        self.port = port
        sensors[port] = self

    def pressed(self):
        return True

    def force(self):
        return 3.5


class FakeImu:
    def heading(self):
        return imu_state["heading"]

    def tilt(self):
        return imu_state["tilt"]

    def reset_heading(self, angle):
        imu_calls.append(("reset_heading", angle))
        imu_state["heading"] = angle


class PrimeHub:
    def __init__(self):
        self.imu = FakeImu()


class StopWatch:
    def time(self):
        return now


def read_input_byte():
    return input_bytes.pop(0) if input_bytes else None


def wait(ms):
    global now
    now += ms
    if now > 2100:
        raise EndSimulation


pybricks = types.ModuleType("pybricks")
pybricks.__path__ = []
devices = types.ModuleType("pybricks.pupdevices")
devices.Motor = Motor
devices.UltrasonicSensor = UltrasonicSensor
devices.ColorSensor = ColorSensor
devices.ForceSensor = ForceSensor
hubs = types.ModuleType("pybricks.hubs")
hubs.PrimeHub = PrimeHub
parameters = types.ModuleType("pybricks.parameters")
parameters.Port = type("Port", (), {name: name for name in "ABCDEF"})
parameters.Stop = type("Stop", (), {"BRAKE": "BRAKE", "COAST": "COAST", "HOLD": "HOLD"})
parameters.Color = type("Color", (), {
    "RED": "COLOR_RED",
    "YELLOW": "COLOR_YELLOW",
    "GREEN": "COLOR_GREEN",
    "BLUE": "COLOR_BLUE",
    "WHITE": "COLOR_WHITE",
    "BLACK": "COLOR_BLACK",
    "NONE": "COLOR_NONE",
})
tools = types.ModuleType("pybricks.tools")
tools.StopWatch = StopWatch
tools.wait = wait
tools.read_input_byte = read_input_byte
sys.modules.update({
    "pybricks": pybricks,
    "pybricks.pupdevices": devices,
    "pybricks.hubs": hubs,
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
assert "SOCER_VER|6" in out, f"Unexpected version output: {out}"
assert "SOCER3_READY|A,D" in out, f"Unexpected ready output: {out}"
assert "SOCER_SENSORS|B:color,C:ultrasonic,E:ultrasonic,F:force,IMU:imu" in out, f"Unexpected sensors output: {out}"
assert "SOCER_DIST|C:180" in out, f"Unexpected distance output: {out}"
assert "SOCER_SNS|B:c=red&r=42,F:p=1&f=35,IMU:h=0&p=5&r=-2" in out, f"Unexpected SNS output: {out}"
assert "SOCER2_ACK" in out
assert "SOCER2_LINK_LOST" in out
assert imu_calls == [("reset_heading", 0)], f"Unexpected IMU calls: {imu_calls}"
assert motors["A"].calls == [
    ("run", 800),
    ("dc", 75),
    ("run_angle", 500, 360, "BRAKE", False),
    ("run_time", 400, 1000, "BRAKE", False),
    ("run", 400),
    ("brake",),
], f"Unexpected calls: {motors['A'].calls}"
assert not motors["D"].calls
assert sensors["C"].light_calls == [
    ("on", 80),
    ("off",),
    ("off",),
    ("off",),
], f"Unexpected ultrasonic light calls: {sensors['C'].light_calls}"
assert sensors["B"].light_calls == [
    ("on", 60),
    ("off",),
    ("off",),
], f"Unexpected color sensor light calls: {sensors['B'].light_calls}"
print("controller hub simulation passed")
