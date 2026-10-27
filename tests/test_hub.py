"""Deterministic simulation of our Hub OS 3 controller; no LEGO hardware required."""
import ast
import math
import unittest
from pathlib import Path
from types import SimpleNamespace

SOURCE = Path(__file__).parents[1] / 'dist' / 'hub_program.py'


class Motors:
    BRAKE = 1
    HOLD = 2

    def __init__(self):
        self.positions = {p: 0.0 for p in range(6)}
        self.velocities = {p: 0.0 for p in range(6)}
        self.commands = []
        self.failed = None

    def relative_position(self, p):
        if p == self.failed:
            raise OSError('ENODEV')
        return round(self.positions[p])

    def run(self, p, velocity):
        if p == self.failed:
            raise OSError('ENODEV')
        self.velocities[p] = velocity
        self.commands.append(('run', p, velocity))

    def stop(self, p, stop=BRAKE):
        if p == self.failed:
            raise OSError('ENODEV')
        self.velocities[p] = 0
        self.commands.append(('stop', p, stop))

    def advance(self, seconds):
        for p in self.positions:
            self.positions[p] += self.velocities[p] * seconds


class HubTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.motor = Motors()
        self.color_value = 0
        self.events = []
        self.tunnel = SimpleNamespace(send=lambda data: self.events.append(data.decode()))
        namespace = dict(
            motor=self.motor,
            port=SimpleNamespace(A=0, B=1, C=2, D=3, E=4, F=5),
            time=SimpleNamespace(ticks_ms=lambda: self.now,
                                 ticks_diff=lambda a,b: ((a-b+2**29) % 2**30)-2**29),
            color=SimpleNamespace(YELLOW=7),
            color_sensor=SimpleNamespace(color=lambda p: self.color_value),
            math=math,
        )
        tree = ast.parse(SOURCE.read_text())
        # Keep our controller definitions/constants, skip hardware imports and launch.
        tree.body = [n for n in tree.body if not isinstance(n, (ast.Import, ast.ImportFrom, ast.Expr))]
        exec(compile(tree, str(SOURCE), 'exec'), namespace)
        self.ns = namespace
        self.controller = namespace['Controller'](self.tunnel)

    def tick(self, count=1):
        for _ in range(count):
            self.now += 10
            self.motor.advance(.01)
            self.controller.update(self.now, .01)

    def drive_for(self, count, speed=140, turn=0):
        for i in range(count):
            if i % 10 == 0:
                self.controller.receive(('v,%s,%s,0' % (speed,turn)).encode())
            self.tick()

    def test_handshake_cannot_start_motors(self):
        self.controller.receive(b'h\n')
        self.tick()
        self.assertIn('SOCCER_STOCK_READY:2|A,D,F,E,-1,1,1', self.events)
        self.assertEqual(self.motor.commands, [])
        self.assertFalse(self.controller.link_active)

    def test_smooth_acceleration_and_stop(self):
        self.drive_for(40)
        self.assertEqual(self.controller.drive.speed, 140)
        self.assertLess(self.motor.velocities[0], 0)
        self.assertGreater(self.motor.velocities[3], 0)
        self.drive_for(35, speed=0)
        self.assertEqual(self.controller.drive.speed, 0)
        self.assertTrue(self.controller.drive.holding)
        self.assertIn(('stop',0,self.motor.HOLD),self.motor.commands)

    def test_reverse_passes_zero(self):
        self.drive_for(40)
        values=[]
        for i in range(60):
            if i%10 == 0:
                self.controller.receive(b'v,-140,0,0')
            self.tick()
            values.append(self.controller.drive.speed)
        self.assertIn(0,values)
        self.assertLess(values[-1],0)

    def test_watchdog_stops_all_motors_and_stays_braked(self):
        self.drive_for(40)
        self.tick(71)
        self.assertEqual(list(self.motor.velocities.values()),[0]*6)
        self.assertTrue(self.controller.drive.latched)
        self.assertIn('LINK_LOST',self.events)
        self.assertFalse(self.controller.link_active)
        self.tick(10)
        self.assertNotIn(('stop',0,self.motor.HOLD),self.motor.commands)

    def test_emergency_wins_over_movement_and_kick_in_same_tick(self):
        self.drive_for(20)
        self.controller.receive(b'x')
        self.controller.receive(b'v,400,150,1')
        self.tick()
        self.assertEqual(self.controller.kicker.state,self.controller.kicker.WAIT)
        self.assertEqual(self.controller.drive.speed,0)
        self.assertEqual(list(self.motor.velocities.values()),[0]*6)

    def test_invalid_packets_do_not_refresh_watchdog_or_fire(self):
        old=self.controller.last_packet
        self.now=500
        for value in (b'v,401,0,1',b'v,0,151,1',b'v,0,0,2',b'v,0,0,nan',b'v,1,2',b'a'*80,b'\xff'):
            self.controller.receive(value)
        self.assertEqual(self.controller.last_packet,old)
        self.assertIsNone(self.controller.target)
        self.assertFalse(self.controller.kick_pending)

    def test_charge_detects_marker_then_preserves_extra_140_degrees(self):
        kicker=self.controller.kicker
        kicker.trigger(self.now)
        for _ in range(3): kicker.update(self.now)
        self.color_value=7
        for _ in range(3): kicker.update(self.now)
        self.assertIsNotNone(kicker.extra_start)
        origin=kicker.extra_start
        self.motor.positions[5]=origin-139
        kicker.update(self.now)
        self.assertEqual(kicker.state,kicker.CHARGING)
        self.motor.positions[5]=origin-140
        kicker.update(self.now)
        self.assertEqual(kicker.state,kicker.READY)
        self.assertIn('STATE:READY',self.events)
        kicker.trigger(self.now)
        self.assertEqual(kicker.state,kicker.SHOOTING)
        start=kicker.start_angle
        self.motor.positions[5]=start-1699
        kicker.update(self.now)
        self.assertEqual(kicker.state,kicker.SHOOTING)
        self.motor.positions[5]=start-1700
        kicker.update(self.now)
        self.assertEqual(kicker.state,kicker.CHARGING)

    def test_kicker_charge_timeout_and_angle_limit(self):
        kicker=self.controller.kicker
        kicker.trigger(0)
        kicker.update(8500)
        self.assertEqual(kicker.state,kicker.ERROR)
        self.assertIn('ERROR:CHARGE_LIMIT',self.events)
        kicker.stop();kicker.trigger(0)
        self.motor.positions[5]=-2200
        kicker.update(100)
        self.assertEqual(kicker.state,kicker.ERROR)

    def test_kicker_shot_timeout(self):
        kicker=self.controller.kicker
        kicker.state=kicker.READY;kicker.trigger(0);kicker.update(6500)
        self.assertEqual(kicker.state,kicker.ERROR)
        self.assertIn('ERROR:SHOT_TIMEOUT',self.events)

    def test_encoder_correction_and_turn_limit(self):
        self.drive_for(30)
        self.motor.positions[0] -= 40
        self.tick()
        # Positive encoder heading error needs a counterclockwise correction.
        left=abs(self.motor.velocities[0]);right=self.motor.velocities[3]
        self.assertLess(left,right)
        self.drive_for(60, speed=400,turn=150)
        self.assertLessEqual(max(abs(v) for v in self.motor.velocities.values()),1000)

    def test_watchdog_handles_ticks_wraparound(self):
        self.now=2**30-40
        self.controller.receive(b'v,100,0,0')
        self.now=660
        self.controller.update(self.now,.01)
        self.assertFalse(self.controller.link_active)
        self.assertTrue(self.controller.drive.latched)

    def test_drive_without_kicker_does_not_access_kicker_port(self):
        self.ns['KICKER'] = None
        self.ns['SENSOR'] = None
        self.motor.failed = 5
        self.controller = self.ns['Controller'](self.tunnel)
        self.drive_for(20)
        self.controller.receive(b'v,0,0,1')
        self.tick()
        self.controller.receive(b'h')
        self.tick()
        self.assertIn('STATE:DISABLED', self.events)
        self.assertFalse(any(command[1] == 5 for command in self.motor.commands))

    def test_one_motor_bench_mode_ignores_turn_and_never_accesses_other_ports(self):
        self.ns['RIGHT'] = None
        self.ns['KICKER'] = None
        self.ns['SENSOR'] = None
        self.motor.failed = 3
        self.controller = self.ns['Controller'](self.tunnel)
        self.controller.receive(b'h')
        self.tick()
        self.assertIn('STATE:DISABLED', self.events)
        self.controller.receive(b'v,140,150,0')
        self.tick(30)
        self.assertLess(self.motor.velocities[0], 0)
        self.assertEqual(self.controller.drive.turn, 0)
        self.assertTrue(all(command[1] == 0 for command in self.motor.commands))
        self.controller.receive(b'v,0,0,0')
        self.tick(40)
        self.assertEqual(self.motor.velocities[0], 0)
        self.controller.receive(b'x')
        self.tick()
        self.assertTrue(self.controller.drive.latched)

    def test_kicker_reverse_changes_both_speed_and_angle_measurement(self):
        self.ns['KICKER_SIGN'] = -1
        kicker = self.controller.kicker
        kicker.trigger(0)
        self.assertEqual(self.motor.velocities[5], 300)
        for _ in range(3): kicker.update(0)
        self.color_value = 7
        for _ in range(3): kicker.update(0)
        self.motor.positions[5] = 140
        kicker.update(0)
        self.assertEqual(kicker.state, kicker.READY)
        kicker.trigger(0)
        self.assertEqual(self.motor.velocities[5], 1000)

    def test_one_failed_motor_does_not_prevent_other_brakes(self):
        self.motor.failed=0
        self.motor.velocities[3]=500;self.motor.velocities[5]=-300
        self.ns['brake_all']()
        self.assertEqual(self.motor.velocities[3],0)
        self.assertEqual(self.motor.velocities[5],0)


if __name__ == '__main__':
    unittest.main()
