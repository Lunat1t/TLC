# Brick Studio: команды выполняются сверху вниз
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Stop
from pybricks.tools import wait

motor_a = Motor(Port.A)
# Защита моторов: момент не выше 80 % от штатного предела (не действует на dc)
_, _, _torque = motor_a.control.limits()
motor_a.control.limits(torque=_torque * 0.8)


motor_a.run_angle(360, 360, then=Stop.BRAKE)
