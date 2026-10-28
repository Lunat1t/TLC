"""Socer V10 ported from PS4 to the phone's single joystick and Pybricks BLE."""

from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Port, Direction, Stop, Color
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch

from uselect import poll, POLLIN
from usys import stdin
from uerrno import ENODEV


# =====================================
# НАСТРОЙКИ ДВИЖЕНИЯ
# =====================================

SPEED = 600
CONFIG_ID = "A,D,F,-1,1,1"

# СКОРОСТЬ ПОВОРОТА
# Меньше значение = медленнее поворот
TURN = 240


# =====================================
# НАСТРОЙКИ КИКЕРА
# =====================================

CHARGE_SPEED = -300
KICK_ANGLE = -1700
KICK_SPEED = 1000

SEARCH_TIMEOUT = 8500
MAX_CHARGE_ANGLE = 2200
SHOT_TIMEOUT = 6500

EXTRA_CHARGE_ANGLE = 140  # градусы ДОЗАРЯДКИ после жёлтой метки

# =====================================
# НАСТРОЙКИ ЗВУКА
# =====================================

READY_SOUND_1 = 784
READY_SOUND_2 = 1047
READY_SOUND_TIME = 80


# =====================================
# ОБОРУДОВАНИЕ
# =====================================

hub = PrimeHub()


def connected_device(device_type, port, label, direction=None):
    """Wait for newly attached Powered Up devices to finish initialization."""
    last_error = None
    for _ in range(10):
        try:
            if direction is None:
                return device_type(port)
            return device_type(port, direction)
        except OSError as error:
            if error.args[0] != ENODEV:
                raise
            last_error = error
            wait(300)
    print("SOCER_MISSING:" + label)
    raise last_error


wait(1000)

left = connected_device(Motor, Port.A, "A", Direction.COUNTERCLOCKWISE)

right = connected_device(Motor, Port.D, "D", Direction.CLOCKWISE)

drive = DriveBase(
    left, right,
    wheel_diameter=56,
    axle_track=112
)

# Включать только при правильных top_side/front_side в PrimeHub().
USE_GYRO = False
if USE_GYRO:
    drive.use_gyro(True)


class DirectDrive:
    HEADING_GAIN = 3.0
    MAX_CORRECTION = 20

    def __init__(self, base):
        self.base = base
        self.speed = self.turn = 0.0
        self.target_speed = self.target_turn = 0
        self.last_time = None
        self.heading = None
        self.holding = False

    def target(self, speed, turn):
        if speed != self.target_speed or turn != self.target_turn:
            self.last_time = None  # следующая команда применяется без ожидания цикла
        self.target_speed, self.target_turn = speed, turn

    def emergency(self):
        self.speed = self.turn = 0.0
        self.target_speed = self.target_turn = 0
        self.heading = None
        self.last_time = None
        self.base.brake()
        self.holding = False

    def update(self, now):
        if self.last_time is not None and now - self.last_time < 10:
            return
        self.last_time = now
        self.speed, self.turn = self.target_speed, self.target_turn
        if self.speed == 0 and self.turn == 0:
            if not self.holding:
                self.base.brake()
                self.holding = True
                self.heading = None
            return
        self.holding = False
        correction = 0
        if self.target_turn == 0 and abs(self.turn) < 1:
            if self.heading is None:
                self.heading = self.base.angle()
            correction = max(-self.MAX_CORRECTION, min(self.MAX_CORRECTION,
                (self.heading - self.base.angle()) * self.HEADING_GAIN))
        else:
            self.heading = None
        self.base.drive(self.speed, self.turn + correction)


motion = DirectDrive(drive)

kicker = connected_device(Motor, Port.F, "F", Direction.CLOCKWISE)

sensor = connected_device(ColorSensor, Port.E, "E")

keyboard = poll()
keyboard.register(stdin, POLLIN)

clock = StopWatch()
last_packet = 0
last_ack = 0
last_speed_report = 0
last_kicker_update = 0
link_active = False
STALE_INPUT_MS = 350
LINK_TIMEOUT = 1200


def watchdog_action(age):
    if age >= LINK_TIMEOUT:
        return 2  # тормозить сразу
    if age >= STALE_INPUT_MS:
        return 1  # снижать заданную скорость до нуля
    return 0


# =====================================
# СОСТОЯНИЯ
# =====================================

WAIT = 0
CHARGING = 1
READY = 2
SHOOTING = 3
RELOADING = 4
ERROR = 5

state = WAIT

marker_start_angle = None

search_time = 0
search_angle = 0
shot_time = 0

marker_left = False
yellow_count = 0
other_count = 0

# =====================================
# ДАТЧИК ЖЁЛТОЙ МЕТКИ
# =====================================

def reset_marker():
    global marker_start_angle
    marker_start_angle = None
    global marker_left
    global yellow_count
    global other_count

    marker_left = False
    yellow_count = 0
    other_count = 0


def check_marker():
    global marker_left
    global yellow_count
    global other_count

    color = sensor.color()

    if color != Color.YELLOW:
        other_count += 1
        yellow_count = 0

        if other_count >= 3:
            marker_left = True

    else:
        other_count = 0

        if marker_left:
            yellow_count += 1
        else:
            yellow_count = 0

    return marker_left and yellow_count >= 3


# =====================================
# ЗАРЯДКА И ПЕРЕЗАРЯДКА
# =====================================

def start_charge(auto=False):
    global state
    global search_time
    global search_angle
    global marker_start_angle

    marker_start_angle = None
    if not auto:
        reset_marker()

    search_time = clock.time()
    search_angle = kicker.angle()

    if auto:
        state = RELOADING
        print(">> АВТОПЕРЕЗАРЯДКА")
    else:
        state = CHARGING
        print(">> ЗАРЯДКА")
    print("SOCER_KICKER_CHARGING")

    hub.display.char("C")
    kicker.run(CHARGE_SPEED)
    play_sound(((440, 60),))


# =====================================
# ЗВУК ГОТОВНОСТИ
# =====================================

sound_notes = ()
sound_index = 0
sound_deadline = 0


def play_sound(notes):
    global sound_notes, sound_index, sound_deadline
    sound_notes = notes
    sound_index = 0
    sound_deadline = clock.time()
    update_sound()


def update_sound():
    global sound_notes, sound_index, sound_deadline
    if not sound_notes or clock.time() < sound_deadline:
        return
    if sound_index >= len(sound_notes):
        hub.speaker.beep(500, 0)
        sound_notes = ()
        return
    frequency, duration = sound_notes[sound_index]
    hub.speaker.beep(frequency, -1)  # Возвращается сразу, тон звучит в фоне.
    sound_deadline = clock.time() + duration
    sound_index += 1


def stop_sound():
    global sound_notes
    sound_notes = ()
    hub.speaker.beep(500, 0)


def ready_sound():
    play_sound(((READY_SOUND_1, READY_SOUND_TIME),
                (READY_SOUND_2, READY_SOUND_TIME)))


# =====================================
# КИКЕР ЗАРЯЖЕН
# =====================================

def charge_complete():
    global state

    kicker.hold()
    state = READY

    hub.display.char("R")

    print(">> КИКЕР ЗАРЯЖЕН!")
    print("SOCER_KICKER_READY")

    # ЗВУК ПОЛНОЙ ЗАРЯДКИ
    ready_sound()


# =====================================
# ВЫСТРЕЛ
# =====================================

def shoot():
    global state
    global shot_time

    if state != READY:
        return

    reset_marker()

    state = SHOOTING
    shot_time = clock.time()

    hub.display.char("F")
    print(">> ВЫСТРЕЛ!")
    print("SOCER_KICKER_SHOOTING")
    play_sound(((1200, 50), (650, 70)))

    kicker.run_angle(
        speed=KICK_SPEED,
        rotation_angle=KICK_ANGLE,
        then=Stop.HOLD,
        wait=False
    )


# =====================================
# ЗАЩИТА КИКЕРА
# =====================================

def kicker_error(message):
    global state

    kicker.brake()
    state = ERROR

    hub.display.char("E")
    print("ОШИБКА:", message)
    print("SOCER_KICKER_ERROR")


# =====================================
# ОБНОВЛЕНИЕ КИКЕРА
# =====================================

def begin_extra_charge():
    global marker_start_angle
    marker_start_angle = kicker.angle()
    # Не тормозим на метке: продолжаем заряд до заданного угла.
    kicker.run(CHARGE_SPEED)
    print(">> ЖЁЛТАЯ МЕТКА: ДОЗАРЯДКА НА", EXTRA_CHARGE_ANGLE, "ГРАДУСОВ")


def update_kicker():
    global state
    global marker_start_angle

    if state == CHARGING or state == RELOADING:

        if marker_start_angle is None and check_marker():
            begin_extra_charge()

        elapsed = clock.time() - search_time
        rotation = abs(
            kicker.angle() - search_angle
        )

        if (
            elapsed >= SEARCH_TIMEOUT
            or rotation >= MAX_CHARGE_ANGLE
        ):
            kicker_error("ПРЕВЫШЕН ЛИМИТ ЗАРЯДКИ")
            return

        if marker_start_angle is not None:
            direction = 1 if CHARGE_SPEED > 0 else -1
            extra_rotation = (kicker.angle() - marker_start_angle) * direction
            if extra_rotation >= EXTRA_CHARGE_ANGLE:
                marker_start_angle = None
                print(">> ДОЗАРЯДКА ЗАВЕРШЕНА")
                charge_complete()

    elif state == SHOOTING:

        found = check_marker()

        if kicker.done():

            start_charge(auto=True)
            if found:
                begin_extra_charge()

        elif clock.time() - shot_time >= SHOT_TIMEOUT:
            kicker_error("ТАЙМАУТ ВЫСТРЕЛА")


# =====================================
# КНОПКА SPACE
# =====================================

def handle_space():
    if state == WAIT:
        start_charge()

    elif state == READY:
        shoot()


# =====================================
# ЭКСТРЕННЫЙ СТОП
# =====================================

def emergency_stop():
    global state

    motion.emergency()
    kicker.brake()

    state = WAIT
    reset_marker()

    hub.display.char("X")
    stop_sound()
    print(">> СТОП!")
    print("SOCER_STOP")
    print("SOCER_KICKER_WAIT")


# =====================================
# ЗАПУСК
# =====================================

print("SOCER PHONE: A/D drive, F kicker, E color sensor")

hub.display.char("C")
print("SOCER_READY|" + CONFIG_ID)
print("SOCER_TUNING|%d|%d" % (SPEED, TURN))
print("SOCER_CONTROL|DIRECT")


# =====================================
# ГЛАВНЫЙ ЦИКЛ
# =====================================

input_buffer = ""

try:
    while True:

        # Пакеты ограничены по длине; движения и кнопка передаются вместе.
        for _ in range(128):
            if not keyboard.poll(0):
                break
            char = stdin.read(1)
            if char == "\n":
                line = input_buffer.strip()
                input_buffer = ""
                if line == "h":
                    print("SOCER_READY|" + CONFIG_ID)
                    print("SOCER_TUNING|%d|%d" % (SPEED, TURN))
                    print("SOCER_CONTROL|DIRECT")
                    continue
                if line == "x":
                    emergency_stop()
                    link_active = False
                    continue
                if line == "k":
                    # Отдельная команда удара не меняет текущую скорость.
                    # При потере потока движения кикер не запускается.
                    if link_active and clock.time() - last_packet < STALE_INPUT_MS:
                        handle_space()
                    continue
                parts = line.split(",")
                if len(parts) != 4 or parts[0] != "v":
                    continue
                try:
                    speed, turn, kick = int(parts[1]), int(parts[2]), int(parts[3])
                except ValueError:
                    continue
                if abs(speed) > SPEED or abs(turn) > TURN or kick not in (0, 1):
                    continue
                last_packet = clock.time()
                link_active = True
                motion.target(speed, turn)
                if kick:
                    handle_space()
            elif len(input_buffer) < 40:
                input_buffer += char
            else:
                input_buffer = "!"  # Повреждённый пакет игнорируется до перевода строки.

        if link_active:
            command_age = clock.time() - last_packet
            link_action = watchdog_action(command_age)
            if link_action == 2:
                emergency_stop()
                link_active = False
                print("SOCER_LINK_LOST")
            elif link_action == 1:
                # При задержке команд сразу тормозим до аварийного тайм-аута.
                motion.target(0, 0)

        now = clock.time()
        motion.update(now)
        # Датчик кикера не должен отнимать время у приёма команд движения.
        if now - last_kicker_update >= 10:
            update_kicker()
            last_kicker_update = now
        update_sound()
        if link_active and clock.time() - last_speed_report >= 2000:
            print("SOCER_SPEED|%d|%d|%d" % (
                int(motion.speed), int(drive.state()[1]), hub.battery.voltage()))
            last_speed_report = clock.time()
        if link_active and clock.time() - last_ack >= 400:
            print("SOCER_ACK")
            last_ack = clock.time()

        wait(1)

except OSError as error:
    print("СБОЙ УСТРОЙСТВА:", error)
    # Диагностика после сбоя: проверяем каждый порт независимо.
    for label, device in (("A: левый мотор", left),
                          ("D: правый мотор", right),
                          ("F: кикер", kicker)):
        try:
            print(label, "OK, угол:", device.angle())
        except Exception as check_error:
            print(label, "ОШИБКА:", check_error)
    try:
        print("E: датчик цвета OK:", sensor.color())
    except Exception as check_error:
        print("E: датчик цвета ОШИБКА:", check_error)
    raise
finally:
    try:
        stop_sound()
    except Exception:
        pass
    # Сбой одного устройства не должен скрывать исходное исключение
    # или мешать остановке оставшихся моторов.
    for label, device in (("A", left), ("D", right), ("F", kicker)):
        try:
            device.brake()
        except Exception as stop_error:
            print("Не удалось затормозить порт", label, stop_error)
