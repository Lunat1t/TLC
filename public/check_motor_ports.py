"""Check connected devices on a SPIKE Prime hub without moving motors."""

from pybricks.iodevices import PUPDevice
from pybricks.parameters import Port
from uerrno import ENODEV
from pybricks.tools import wait


ports = (("A", Port.A), ("B", Port.B), ("C", Port.C),
         ("D", Port.D), ("E", Port.E), ("F", Port.F))
found = {}
wait(1500)
for _ in range(10):
    for name, port in ports:
        if name in found:
            continue
        try:
            found[name] = PUPDevice(port).info()
        except OSError as error:
            if error.args[0] != ENODEV:
                print(name, "OTHER ERROR", error)
                raise
    wait(300)
for name, port in ports:
    if name in found:
        print(name, "CONNECTED", found[name])
    else:
        print(name, "NO DEVICE")
