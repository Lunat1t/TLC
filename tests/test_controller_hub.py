import contextlib
import io
import runpy
import sys
import types
from pathlib import Path


class EndSimulation(Exception):
    pass


unplug_log = []


ENODEV = 19
now = 0
# What is physically plugged in right now; the schedule in wait() changes it.
present = {"A": "motor", "B": "color", "C": "ultrasonic", "D": "motor", "E": "ultrasonic", "F": "force"}
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


def require(port, kind):
    if present.get(port) != kind:
        raise OSError(ENODEV, "No device")


class Motor:
    def __init__(self, port):
        require(port, "motor")
        self.port = port
        self.calls = []
        motors[port] = self

    def angle(self):
        require(self.port, "motor")
        return 0

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
        require(port, "ultrasonic")
        self.port = port
        self.light_calls = []
        self.lights = SensorLights(self)
        sensors[port] = self

    def distance(self):
        require(self.port, "ultrasonic")
        if self.port == "E":
            # A read error that is not "no device" must NOT drop the sensor.
            raise OSError("Sensor read error")
        return 180


class ColorSensor:
    def __init__(self, port):
        require(port, "color")
        self.port = port
        self.light_calls = []
        self.lights = SensorLights(self)
        sensors[port] = self

    def color(self):
        return "COLOR_RED"

    def reflection(self):
        require(self.port, "color")
        return 42


class ForceSensor:
    def __init__(self, port):
        require(port, "force")
        self.port = port
        sensors[port] = self

    def pressed(self):
        return True

    def force(self):
        require(self.port, "force")
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
    # Hot-plug schedule: motor D is pulled out, later the force sensor F is
    # pulled out and a motor is put on D again.
    if now >= 900 and unplug_log == []:
        present.pop("D")
        unplug_log.append("D out")
    if now >= 1400 and len(unplug_log) == 1:
        present.pop("F")
        present["D"] = "motor"
        unplug_log.append("F out, D motor in")
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
uerrno = types.ModuleType("uerrno")
uerrno.ENODEV = ENODEV
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
    "uerrno": uerrno,
})
output = io.StringIO()
with contextlib.redirect_stdout(output):
    try:
        runpy.run_path(str(Path(__file__).parents[1] / "public" / "hub_program.py"))
    except EndSimulation:
        pass

out = output.getvalue()
assert "SOCER_VER|7" in out, f"Unexpected version output: {out}"
assert "SOCER3_READY|A,D" in out, f"Unexpected ready output: {out}"
assert "SOCER_SENSORS|B:color,C:ultrasonic,E:ultrasonic,F:force,IMU:imu" in out, f"Unexpected sensors output: {out}"
ports_lines = [line for line in out.splitlines() if line.startswith("SOCER_PORTS|")]
assert ports_lines[0] == "SOCER_PORTS|A:motor,B:color,C:ultrasonic,D:motor,E:ultrasonic,F:force", ports_lines
# Hot-plug: D is unplugged, then D is plugged back, then F is unplugged; each
# change is reported once, in the order the hub noticed it.
assert ports_lines[1:] == [
    "SOCER_PORTS|A:motor,B:color,C:ultrasonic,E:ultrasonic,F:force",
    "SOCER_PORTS|A:motor,B:color,C:ultrasonic,D:motor,E:ultrasonic,F:force",
    "SOCER_PORTS|A:motor,B:color,C:ultrasonic,D:motor,E:ultrasonic",
], ports_lines
# A sensor read error that is not ENODEV (port E) must not make E disappear.
assert all("E:ultrasonic" in line for line in ports_lines), ports_lines
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
