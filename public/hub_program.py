"""TLC universal motor controller for Pybricks Powered Up hubs.

Install once with https://code.pybricks.com/ . Stop the program there and
disconnect Pybricks Code before connecting from the TLC website.
"""
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Stop
from pybricks.tools import StopWatch, wait, read_input_byte

MAX_SPEED = 1000
LINK_TIMEOUT_MS = 600
PORT_NAMES = ("A", "B", "C", "D", "E", "F")

motors = {}
for name in PORT_NAMES:
    try:
        motors[name] = Motor(getattr(Port, name))
    except (AttributeError, OSError):
        pass

clock = StopWatch()
buffer = ""
last_command = clock.time()
last_ack = clock.time()
link_active = False
speeds = {}


def stop_all():
    global link_active
    link_active = False
    for name, motor in motors.items():
        if speeds.get(name, 0):
            motor.brake()
        speeds[name] = 0


def ready():
    print("SOCER3_READY|" + ",".join(motors))


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
    if len(parts) < 3 or parts[1] not in motors:
        return

    port = parts[1]

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


if not motors:
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
        if link_active and now - last_ack >= 200:
            print("SOCER2_ACK")
            last_ack = now
        wait(10)
finally:
    stop_all()
