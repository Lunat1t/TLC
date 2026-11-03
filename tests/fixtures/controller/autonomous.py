# TLC: команды выполняются сверху вниз
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Stop
from pybricks.tools import wait

motor_a = Motor(Port.A)

motor_a.run_angle(360, 360, then=Stop.BRAKE)
