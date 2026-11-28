"""TLC universal motor controller for Pybricks Powered Up hubs.

Install once with https://code.pybricks.com/ . Stop the program there and
disconnect Pybricks Code before connecting from the TLC website.
"""
from pybricks.pupdevices import Motor, UltrasonicSensor
try:
    from pybricks.pupdevices import ColorSensor, ForceSensor
except ImportError:
    ColorSensor = None
    ForceSensor = None
from pybricks.parameters import Port, Stop
try:
    from pybricks.parameters import Color
except ImportError:
    Color = None
from pybricks.tools import StopWatch, wait, read_input_byte

try:
    from uerrno import ENODEV
except ImportError:
    ENODEV = 19

MAX_SPEED = 1000
PROGRAM_VERSION = "8"
LINK_TIMEOUT_MS = 2000
SENSOR_POLL_MS = 150
SENSOR_HEARTBEAT_MS = 500
# Hot-plug: one port is checked every SCAN_MS, so a full pass over A-F takes
# about 0.6 s. Empty ports are probed for a new device, occupied ports are
# checked that the device is still there.
SCAN_MS = 100
PORT_NAMES = ("A", "B", "C", "D", "E", "F")

COLOR_NAMES = ()
if Color is not None:
    COLOR_NAMES = (
        (getattr(Color, "RED", None), "red"),
        (getattr(Color, "YELLOW", None), "yellow"),
        (getattr(Color, "GREEN", None), "green"),
        (getattr(Color, "BLUE", None), "blue"),
        (getattr(Color, "WHITE", None), "white"),
        (getattr(Color, "BLACK", None), "black"),
        (getattr(Color, "NONE", None), "none"),
    )

hub = None
for _hub_name in ("PrimeHub", "TechnicHub"):
    try:
        _hubs = __import__("pybricks.hubs", None, None, (_hub_name,))
        _hub_cls = getattr(_hubs, _hub_name, None)
        if _hub_cls is not None:
            hub = _hub_cls()
            break
    except (ImportError, AttributeError, OSError):
        pass
imu = getattr(hub, "imu", None) if hub is not None else None
speaker = getattr(hub, "speaker", None) if hub is not None else None
tone_end = None

motors = {}
sensors = {}
sensor_types = {}
SENSOR_CLASSES = (
    ("ultrasonic", UltrasonicSensor),
    ("color", ColorSensor),
    ("force", ForceSensor),
)


def attach(name):
    """Try to find a device on port `name`; True if one was registered."""
    port = getattr(Port, name, None)
    if port is None:
        return False
    try:
        motors[name] = Motor(port)
        return True
    except (AttributeError, OSError):
        pass
    for stype, scls in SENSOR_CLASSES:
        if scls is None:
            continue
        try:
            sensors[name] = scls(port)
            sensor_types[name] = stype
            return True
        except (AttributeError, OSError):
            pass
    return False


def is_unplugged(name):
    """True only when the hub reports that the device on `name` is gone."""
    try:
        if name in motors:
            motors[name].angle()
        else:
            stype = sensor_types.get(name)
            if stype == "ultrasonic":
                sensors[name].distance()
            elif stype == "color":
                sensors[name].reflection()
            elif stype == "force":
                sensors[name].force()
    except OSError as error:
        return bool(error.args) and error.args[0] == ENODEV
    except AttributeError:
        return False
    return False


def detach(name):
    motors.pop(name, None)
    speeds.pop(name, None)
    sensors.pop(name, None)
    sensor_types.pop(name, None)
    last_distances.pop(name, None)
    last_sns.pop(name, None)


for name in PORT_NAMES:
    attach(name)

clock = StopWatch()
buffer = ""
last_command = clock.time()
last_ack = clock.time()
last_sensor_poll = clock.time() - SENSOR_POLL_MS
last_sensor_emit = clock.time()
last_sns_emit = clock.time()
link_active = False
speeds = {}
last_distances = {}
last_sns = {}
last_scan = clock.time()
scan_index = 0
last_ports_report = ""


def _color_name(val):
    for c_obj, c_name in COLOR_NAMES:
        if c_obj is not None and val == c_obj:
            return c_name
    return "none"


def silence():
    """Mute the speaker without blocking the command loop."""
    global tone_end
    tone_end = None
    if speaker is not None:
        speaker.volume(0)
        speaker.beep(500, -1)


def play_tone(frequency, ms, volume):
    """Start a tone and return at once; the main loop ends it after `ms`."""
    global tone_end
    if speaker is None:
        return
    if not frequency or not ms or not volume:
        silence()
        return
    speaker.volume(volume)
    speaker.beep(frequency, -1)
    tone_end = clock.time() + ms


def stop_all():
    global link_active
    link_active = False
    if tone_end is not None:
        silence()
    last_distances.clear()
    last_sns.clear()
    for name, motor in motors.items():
        if speeds.get(name, 0):
            motor.brake()
        speeds[name] = 0
    for name, sensor in sensors.items():
        if sensor_types.get(name) not in ("ultrasonic", "color"):
            continue
        try:
            sensor.lights.off()
        except (AttributeError, OSError):
            pass


def ready():
    print("SOCER_VER|" + PROGRAM_VERSION)
    print("SOCER3_READY|" + ",".join(motors))
    entries = [name + ":" + sensor_types[name] for name in PORT_NAMES if name in sensors]
    if imu is not None:
        entries.append("IMU:imu")
    print("SOCER_SENSORS|" + ",".join(entries))
    report_ports(True)


def port_summary():
    entries = []
    for name in PORT_NAMES:
        if name in motors:
            entries.append(name + ":motor")
        elif name in sensors:
            entries.append(name + ":" + sensor_types[name])
    return ",".join(entries)


def report_ports(force=False):
    """Tell the app which devices sit on which ports; only when it changed."""
    global last_ports_report
    summary = port_summary()
    if force or summary != last_ports_report:
        last_ports_report = summary
        print("SOCER_PORTS|" + summary)


def scan_ports(now):
    """Check one port per call and report plugged/unplugged devices."""
    global last_scan, scan_index
    if now - last_scan < SCAN_MS:
        return
    last_scan = now
    name = PORT_NAMES[scan_index]
    scan_index = (scan_index + 1) % len(PORT_NAMES)
    if name in motors or name in sensors:
        if is_unplugged(name):
            detach(name)
    else:
        attach(name)
    report_ports()


def poll_sensors(now):
    global last_sensor_poll, last_sensor_emit, last_sns_emit
    if (not sensors and imu is None) or now - last_sensor_poll < SENSOR_POLL_MS:
        return
    last_sensor_poll = now
    dist_pairs = []
    dist_changed = False
    sns_pairs = []
    sns_changed = False
    for name in PORT_NAMES:
        sensor = sensors.get(name)
        stype = sensor_types.get(name)
        if sensor is None:
            continue
        if stype == "ultrasonic":
            try:
                dist = int(sensor.distance())
            except (AttributeError, OSError):
                continue
            if last_distances.get(name) != dist:
                last_distances[name] = dist
                dist_changed = True
            dist_pairs.append(name + ":" + str(dist))
        elif stype == "color":
            try:
                cname = _color_name(sensor.color())
                refl = int(sensor.reflection())
            except (AttributeError, OSError):
                continue
            payload = "c=" + cname + "&r=" + str(refl)
            if last_sns.get(name) != payload:
                last_sns[name] = payload
                sns_changed = True
            sns_pairs.append(name + ":" + payload)
        elif stype == "force":
            try:
                pr = 1 if sensor.pressed() else 0
                frc = int(round(sensor.force() * 10))
            except (AttributeError, OSError):
                continue
            payload = "p=" + str(pr) + "&f=" + str(frc)
            if last_sns.get(name) != payload:
                last_sns[name] = payload
                sns_changed = True
            sns_pairs.append(name + ":" + payload)
    if imu is not None:
        try:
            hdg = int(round(imu.heading()))
            tlt = imu.tilt()
            pitch = int(round(tlt[0]))
            roll = int(round(tlt[1]))
            payload = "h=" + str(hdg) + "&p=" + str(pitch) + "&r=" + str(roll)
            if last_sns.get("IMU") != payload:
                last_sns["IMU"] = payload
                sns_changed = True
            sns_pairs.append("IMU:" + payload)
        except (AttributeError, OSError, IndexError, TypeError):
            pass
    if dist_pairs and (dist_changed or now - last_sensor_emit >= SENSOR_HEARTBEAT_MS):
        print("SOCER_DIST|" + ",".join(dist_pairs))
        last_sensor_emit = now
    if sns_pairs and (sns_changed or now - last_sns_emit >= SENSOR_HEARTBEAT_MS):
        print("SOCER_SNS|" + ",".join(sns_pairs))
        last_sns_emit = now


def process(line):
    global last_command, link_active
    if line == "h":
        ready()
        return
    if line == "x":
        stop_all()
        print("SOCER2_STOP")
        return
    if line == "k":
        last_command = clock.time()
        link_active = True
        return

    parts = line.split(",")
    cmd = parts[0] if parts else ""
    if len(parts) < 3:
        return

    port = parts[1]

    if cmd == "n" and len(parts) == 4:
        try:
            frequency, ms, volume = int(parts[1]), int(parts[2]), int(parts[3])
        except ValueError:
            return
        if frequency != 0 and not 64 <= frequency <= 24000:
            return
        if not 0 <= ms <= 10000 or not 0 <= volume <= 100:
            return
        play_tone(frequency, ms, volume)
        # A tone alone never arms the link watchdog: the editor may preview a
        # sound while no program (and no heartbeat) is running.
        if link_active:
            last_command = clock.time()
        return

    if cmd == "g" and len(parts) == 3 and port == "IMU" and parts[2] == "r":
        if imu is None:
            return
        try:
            imu.reset_heading(0)
            last_sns.pop("IMU", None)
        except (AttributeError, OSError):
            return
        last_command = clock.time()
        link_active = True
        return

    if cmd == "u" and len(parts) == 3 and port in sensors:
        if sensor_types.get(port) not in ("ultrasonic", "color"):
            return
        try:
            brightness = int(parts[2])
        except ValueError:
            return
        if brightness < -1 or brightness > 100:
            return
        try:
            if brightness == -1:
                sensors[port].lights.off()
            else:
                sensors[port].lights.on(brightness)
        except (AttributeError, OSError):
            return
        last_command = clock.time()
        link_active = True
        return

    if port not in motors:
        return

    if cmd == "m" and len(parts) == 3:
        try:
            speed = int(parts[2])
        except ValueError:
            return
        if speed < -MAX_SPEED or speed > MAX_SPEED:
            return
        # A finite run_time/run_angle may have finished while speeds still
        # remembers its last command. Re-issue every explicit motor command.
        if speed:
            motors[port].run(speed)
        else:
            motors[port].brake()
        speeds[port] = speed
        last_command = clock.time()
        link_active = True
        return

    if cmd == "d" and len(parts) == 3:
        try:
            power = int(parts[2])
        except ValueError:
            return
        if power < -100 or power > 100:
            return
        if power:
            motors[port].dc(power)
        else:
            motors[port].brake()
        speeds[port] = power
        last_command = clock.time()
        link_active = True
        return

    if cmd == "a" and len(parts) == 4:
        try:
            speed = int(parts[2])
            deg = int(parts[3])
        except ValueError:
            return
        if speed < -MAX_SPEED or speed > MAX_SPEED or deg < 0:
            return
        motors[port].run_angle(speed, deg, then=Stop.BRAKE, wait=False)
        speeds[port] = speed
        last_command = clock.time()
        link_active = True
        return

    if cmd == "t" and len(parts) == 4:
        try:
            speed = int(parts[2])
            ms = int(parts[3])
        except ValueError:
            return
        if speed < -MAX_SPEED or speed > MAX_SPEED or ms < 0:
            return
        motors[port].run_time(speed, ms, then=Stop.BRAKE, wait=False)
        speeds[port] = speed
        last_command = clock.time()
        link_active = True
        return


if not motors and not sensors and imu is None:
    print("SOCER2_NO_MOTORS")
ready()
try:
    while True:
        for _ in range(80):
            value = read_input_byte()
            if value is None:
                break
            if value == 10:
                process(buffer.strip())
                buffer = ""
            elif value == 13:
                pass
            elif 32 <= value <= 126 and len(buffer) < 50:
                buffer += chr(value)
            else:
                buffer = ""
        now = clock.time()
        if link_active and now - last_command > LINK_TIMEOUT_MS:
            stop_all()
            print("SOCER2_LINK_LOST")
        if link_active and now - last_ack >= 250:
            print("SOCER2_ACK")
            last_ack = now
        if tone_end is not None and now >= tone_end:
            silence()
        scan_ports(now)
        if link_active:
            poll_sensors(now)
        wait(10)
finally:
    stop_all()
