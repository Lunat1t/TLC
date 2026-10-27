import ast
import pathlib
import unittest


SOURCE = pathlib.Path(__file__).parents[1] / "dist" / "socer_full.py"


class FakeBase:
    def __init__(self):
        self.commands = []
        self.heading = 0
        self.speed = 0

    def drive(self, speed, turn):
        self.commands.append(("drive", speed, turn))

    def brake(self):
        self.commands.append(("brake",))

    def stop(self):
        self.commands.append(("stop",))

    def state(self):
        return (0, self.speed, self.heading, 0)

    def angle(self):
        return self.heading


class FakeMotor:
    def __init__(self):
        self.holds = 0

    def hold(self):
        self.holds += 1


class FullSocerTest(unittest.TestCase):
    def setUp(self):
        source = SOURCE.read_text()
        tree = ast.parse(source)
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                   and node.name == "DirectDrive")
        self.left = FakeMotor()
        self.right = FakeMotor()
        scope = {"left": self.left, "right": self.right}
        exec(compile(ast.Module(body=[cls], type_ignores=[]), str(SOURCE), "exec"), scope)
        self.base = FakeBase()
        self.motion = scope["DirectDrive"](self.base)

    def test_drive_and_reverse_apply_without_software_ramp(self):
        motion = self.motion
        motion.target(600, 240)
        motion.update(0)
        self.assertEqual(motion.speed, 600)
        self.assertEqual(motion.turn, 240)
        self.assertEqual(self.base.commands[-1], ("drive", 600, 240))
        motion.target(-600, 0)
        motion.update(1)
        self.assertEqual(motion.speed, -600)
        self.assertEqual(self.base.commands[-1][1], -600)
        motion.target(0, 0)
        motion.update(2)
        self.assertEqual(self.base.commands[-1], ("brake",))
        motion.emergency()
        self.assertEqual(motion.speed, 0)
        self.assertEqual(self.base.commands[-1], ("brake",))

    def test_neutral_brakes_once(self):
        motion = self.motion
        motion.update(0)
        self.assertEqual(self.base.commands, [("brake",)])
        motion.update(30)
        self.assertEqual(self.base.commands, [("brake",)])

    def test_phone_protocol_and_ports(self):
        source = SOURCE.read_text()
        self.assertIn('CONFIG_ID = "A,D,F,-1,1,1"', source)
        self.assertIn('keyboard.register(stdin, POLLIN)', source)
        self.assertIn('print("SOCER_READY|" + CONFIG_ID)', source)
        self.assertIn('print("SOCER_ACK")', source)
        self.assertIn('print("SOCER_LINK_LOST")', source)
        self.assertIn('Port.E, "E"', source)
        self.assertIn('print("SOCER_TUNING|%d|%d" % (SPEED, TURN))', source)
        self.assertIn('SPEED = 600', source)
        self.assertIn('TURN = 240', source)
        self.assertIn('if now - last_kicker_update >= 10:', source)
        self.assertIn('SOCER_CONTROL|DIRECT', source)

    def test_link_gap_slows_before_emergency_stop(self):
        tree = ast.parse(SOURCE.read_text())
        fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                  and node.name == "watchdog_action")
        scope = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
                if node.targets[0].id in ("STALE_INPUT_MS", "LINK_TIMEOUT"):
                    scope[node.targets[0].id] = ast.literal_eval(node.value)
        self.assertEqual(scope, {"STALE_INPUT_MS": 350, "LINK_TIMEOUT": 1200})
        exec(compile(ast.Module(body=[fn], type_ignores=[]), str(SOURCE), "exec"), scope)
        action = scope["watchdog_action"]
        self.assertEqual(action(349), 0)
        self.assertEqual(action(350), 1)
        self.assertEqual(action(1199), 1)
        self.assertEqual(action(1200), 2)


if __name__ == "__main__":
    unittest.main()
