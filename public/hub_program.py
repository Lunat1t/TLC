"""SOCER phone controller for Pybricks. Upload with code.pybricks.com."""
from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Stop
from pybricks.tools import StopWatch, wait
from uselect import poll, POLLIN
from usys import stdin

# These values are filled by the web controller when downloading this file.
LEFT_PORT = Port.A
RIGHT_PORT = None
KICKER_PORT = None
LEFT_SIGN = 1
RIGHT_SIGN = 1
KICKER_SIGN = 1
CONFIG_ID = "A,-,-,1,1,1"

WHEEL_DIAMETER = 56
AXLE_TRACK = 112
MAX_SPEED = 400
MAX_TURN = 150
LINK_TIMEOUT_MS = 600

hub = PrimeHub()
left = Motor(LEFT_PORT)
right = Motor(RIGHT_PORT) if RIGHT_PORT is not None else None
kicker = Motor(KICKER_PORT) if KICKER_PORT is not None else None
keyboard = poll()
keyboard.register(stdin, POLLIN)
clock = StopWatch()
buffer = ""
target_speed = 0
target_turn = 0
left_speed = 0
right_speed = 0
last_packet = -LINK_TIMEOUT_MS
last_ack = 0
link_active = False


def emergency_stop():
    global target_speed, target_turn, left_speed, right_speed, link_active
    target_speed = target_turn = 0
    left_speed = right_speed = 0
    link_active = False
    left.brake()
    if right is not None:
        right.brake()
    if kicker is not None:
        kicker.brake()


def process_line(line):
    global target_speed, target_turn, last_packet, link_active
    if line == "h":
        print("SOCER_READY|" + CONFIG_ID)
        print("SOCER_CONTROL|DIRECT")
        return
    if line == "x":
        emergency_stop()
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
    if abs(speed) > MAX_SPEED or abs(turn) > MAX_TURN or kick not in (0, 1):
        return
    target_speed = speed
    target_turn = turn if right is not None else 0
    last_packet = clock.time()
    link_active = True
    if kick and kicker is not None and kicker.done():
        kicker.run_angle(700, 360 * KICKER_SIGN, then=Stop.BRAKE, wait=False)


def update_drive(now):
    global left_speed, right_speed
    # Wheel speed in mm/s, converted to degrees/s for 56 mm wheels.
    wheel_factor = 360 / (3.14159265 * WHEEL_DIAMETER)
    turn_factor = 3.14159265 * AXLE_TRACK / 360
    desired_left = (target_speed - target_turn * turn_factor) * wheel_factor * LEFT_SIGN
    desired_right = (target_speed + target_turn * turn_factor) * wheel_factor * RIGHT_SIGN
    desired_left = int(max(-800, min(800, desired_left)))
    desired_right = int(max(-800, min(800, desired_right)))
    if desired_left != left_speed:
        left_speed = desired_left
        if desired_left == 0:
            left.brake()
        else:
            left.run(desired_left)
    if right is not None and desired_right != right_speed:
        right_speed = desired_right
        if desired_right == 0:
            right.brake()
        else:
            right.run(desired_right)


print("SOCER_READY|" + CONFIG_ID)
print("SOCER_CONTROL|DIRECT")
hub.display.char("S")
try:
    while True:
        for _ in range(80):
            if not keyboard.poll(0):
                break
            char = stdin.read(1)
            if char == "\n":
                process_line(buffer.strip())
                buffer = ""
            elif len(buffer) < 50:
                buffer += char
            else:
                buffer = "!"
        now = clock.time()
        if link_active and now - last_packet > LINK_TIMEOUT_MS:
            emergency_stop()
            print("SOCER_LINK_LOST")
        update_drive(now)
        if link_active and now - last_ack >= 200:
            print("SOCER_ACK")
            last_ack = now
        wait(10)
finally:
    emergency_stop()
