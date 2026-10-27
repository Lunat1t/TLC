
from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Port, Direction, Stop, Color
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch

from uselect import poll
from usys import stdin


# =====================================
# НАСТРОЙКИ ДВИЖЕНИЯ
# =====================================

SPEED = 400

# СКОРОСТЬ ПОВОРОТА
# Меньше значение = медленнее поворот
TURN = 150


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

FIRST_TIMEOUT = 350
REPEAT_TIMEOUT = 350


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

left = Motor(
    Port.A, Direction.COUNTERCLOCKWISE
)

right = Motor(
    Port.D, Direction.CLOCKWISE
)

drive = DriveBase(
    left, right,
    wheel_diameter=56,
    axle_track=112
)

# Скорость команд меняется ниже каждые 10 мс, независимо от частоты BLE.
drive.settings(straight_acceleration=900, turn_acceleration=700)
# Включать только при правильных top_side/front_side в PrimeHub().
USE_GYRO = False
if USE_GYRO:
    drive.use_gyro(True)


class SmoothDrive:
    ACCELERATION = 450       # мм/с²
    DECELERATION = 650       # мм/с²: с 140 мм/с остановка примерно за 0.22 с
    TURN_ACCELERATION = 360  # град/с²
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
        self.target_speed, self.target_turn = speed, turn

    @staticmethod
    def approach(current, target, step):
        return max(current - step, min(current + step, target))

    def emergency(self):
        self.speed = self.turn = 0.0
        self.target_speed = self.target_turn = 0
        self.heading = None
        self.last_time = None
        self.base.brake()
        self.holding = False

    def update(self, now):
        if self.last_time is None:
            self.last_time = now
            return
        elapsed = now - self.last_time
        if elapsed < 10:
            return
        self.last_time = now
        dt = min(elapsed, 30) / 1000
        # Реверс всегда проходит через нулевую команду скорости.
        target = self.target_speed
        if self.speed * target < 0:
            target = 0
        rate = self.ACCELERATION if abs(target) > abs(self.speed) else self.DECELERATION
        self.speed = self.approach(self.speed, target, rate * dt)
        self.turn = self.approach(self.turn, self.target_turn, self.TURN_ACCELERATION * dt)
        if self.speed == 0 and self.turn == 0 and self.target_speed == 0 and self.target_turn == 0:
            if not self.holding:
                # Завершаем замедление по фактической скорости, затем держим колёса.
                self.base.drive(0, 0)
                if abs(self.base.state()[1]) <= 5 and abs(self.base.state()[3]) <= 5:
                    self.base.stop()
                    left.hold()
                    right.hold()
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


motion = SmoothDrive(drive)

kicker = Motor(
    Port.F, Direction.CLOCKWISE
)

sensor = ColorSensor(Port.E)

keyboard = poll()
keyboard.register(stdin)

clock = StopWatch()
last_packet = 0
link_active = False
LINK_TIMEOUT = 700


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

current_move = None
last_move_time = 0
key_repeating = False


# =====================================
# ДВИЖЕНИЕ WASD
# =====================================

def move(key):
    global current_move
    global last_move_time
    global key_repeating

    now = clock.time()

    if key == current_move:
        key_repeating = True
        last_move_time = now
        return

    current_move = key
    
    last_move_time = now
    key_repeating = False

    if key == "w":
        drive.drive(SPEED, 0)

    elif key == "s":
        drive.drive(-SPEED, 0)

    elif key == "a":
        drive.drive(0, -TURN)

    elif key == "d":
        drive.drive(0, TURN)


# =====================================
# АВТОМАТИЧЕСКАЯ ОСТАНОВКА
# =====================================

def update_movement():
    global current_move
    global key_repeating

    if current_move is None:
        return

    if key_repeating:
        timeout = REPEAT_TIMEOUT
    else:
        timeout = FIRST_TIMEOUT

    if clock.time() - last_move_time >= timeout:
        drive.brake()
        current_move = None
        key_repeating = False


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
    global current_move
    global key_repeating

    motion.emergency()
    kicker.brake()

    current_move = None
    key_repeating = False

    state = WAIT
    reset_marker()

    hub.display.char("X")
    stop_sound()
    print(">> СТОП!")


# =====================================
# ЗАПУСК
# =====================================

print("============================")
print("    FOOTBALL ROBOT PS4 V10")
print("============================")
print("PS4: раскладка управления указана в терминале компьютера")
print("Крестик - Заряд / Выстрел")
print("Круг - Экстренный стоп")
print("============================")

hub.display.char("C")
print("PS4_READY")


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
                    print("SOCCER_WEB_READY")
                    continue
                if line == "x":
                    emergency_stop()
                    last_packet = clock.time()
                    link_active = True
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

        if link_active and clock.time() - last_packet >= LINK_TIMEOUT:
            emergency_stop()
            link_active = False
            print(">> ПОТЕРЯ СВЯЗИ")

        motion.update(clock.time())
        update_kicker()
        update_sound()

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
