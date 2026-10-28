"""SOCER: phone joystick controls only the motor on port A.

Install this program with Pybricks Code. It waits for commands from the
SOCER web controller and brakes if commands stop arriving.
"""

from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port
from pybricks.tools import StopWatch, wait
from uselect import poll, POLLIN
from usys import stdin
from uerrno import ENODEV


hub = PrimeHub()
# Give a newly connected SPIKE motor time to finish port initialization.
wait(1000)
motor = None
last_port_error = None
for _ in range(10):
    try:
        motor = Motor(Port.A)
        break
    except OSError as error:
        if error.args[0] != ENODEV:
            raise
        last_port_error = error
        wait(300)
if motor is None:
    print("SOCER_MOTOR_A_NOT_FOUND")
    raise last_port_error
clock = StopWatch()
keyboard = poll()
keyboard.register(stdin, POLLIN)

CONFIG_ID = "A,-,-,1,1,1"
MAX_MM_S = 400
WHEEL_DIAMETER_MM = 56
MAX_MOTOR_DEG_S = 800
LINK_TIMEOUT_MS = 600
MM_S_TO_DEG_S = 360 / (3.14159265 * WHEEL_DIAMETER_MM)

input_buffer = ""
target_speed = 0
current_speed = 0
last_command = 0
last_ack = 0
link_active = False


def brake():
    global target_speed, current_speed, link_active
    target_speed = 0
    current_speed = 0
    link_active = False
    motor.brake()


def command(line):
    global target_speed, last_command, link_active
    if line == "h":
        print("SOCER_READY|" + CONFIG_ID)
        print("SOCER_CONTROL|DIRECT")
        return
    if line == "x":
        brake()
        print("SOCER_STOP")
        return
    parts = line.split(",")
    if len(parts) != 4 or parts[0] != "v":
        return
    try:
        speed = int(parts[1])
        turn = int(parts[2])
        kick = int(parts[3])
    except ValueError:
        return
    if abs(speed) > MAX_MM_S or abs(turn) > 150 or kick not in (0, 1):
        return
    # With only one drive motor, turn and kick are ignored.
    target_speed = speed
    last_command = clock.time()
    link_active = True


def update_motor(now):
    global current_speed
    desired = int(max(-MAX_MOTOR_DEG_S, min(MAX_MOTOR_DEG_S,
        target_speed * MM_S_TO_DEG_S)))
    if desired == current_speed:
        return
    current_speed = desired
    if desired == 0:
        motor.brake()
    else:
        motor.run(desired)


hub.display.char("A")
print("SOCER_READY|" + CONFIG_ID)
print("SOCER_CONTROL|DIRECT")
try:
    while True:
        for _ in range(80):
            if not keyboard.poll(0):
                break
            char = stdin.read(1)
            if char == "\n":
                command(input_buffer.strip())
                input_buffer = ""
            elif len(input_buffer) < 50:
                input_buffer += char
            else:
                input_buffer = "!"

        now = clock.time()
        if link_active and now - last_command > LINK_TIMEOUT_MS:
            brake()
            print("SOCER_LINK_LOST")
        update_motor(now)
        if link_active and now - last_ack >= 200:
            print("SOCER_ACK")
            last_ack = now
        wait(10)
finally:
    brake()
