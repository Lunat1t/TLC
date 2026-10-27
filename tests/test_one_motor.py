import ast
import pathlib
import unittest


SOURCE = pathlib.Path(__file__).parents[1] / "dist" / "one_motor_A.py"


class FakeMotor:
    def __init__(self):
        self.calls = []

    def run(self, speed):
        self.calls.append(("run", speed))

    def brake(self):
        self.calls.append(("brake",))


class FakeClock:
    now = 0

    def time(self):
        return self.now


class OneMotorTest(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(SOURCE.read_text())
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
        self.motor = FakeMotor()
        self.clock = FakeClock()
        self.state = {
            "motor": self.motor, "clock": self.clock, "print": lambda *args: None,
            "CONFIG_ID": "A,-,-,1,1,1", "MAX_MM_S": 400,
            "MAX_MOTOR_DEG_S": 800, "ACCEL_DEG_S2": 1100,
            "DECEL_DEG_S2": 1600, "MM_S_TO_DEG_S": 360 / (3.14159265 * 56),
            "target_speed": 0, "current_speed": 0.0, "last_command": 0,
            "last_update": 0, "link_active": False,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), "exec"), self.state)

    def test_only_drive_and_immediate_brake(self):
        self.state["command"]("v,400,150,1")
        self.assertEqual(self.state["target_speed"], 400)
        self.assertTrue(self.state["link_active"])
        self.state["update_motor"](10)
        self.assertEqual(self.motor.calls[-1], ("run", 800))
        self.state["command"]("v,0,0,0")
        self.state["update_motor"](20)
        self.assertEqual(self.motor.calls[-1], ("brake",))

    def test_invalid_packet_and_stop(self):
        self.state["command"]("v,9999,0,0")
        self.assertFalse(self.state["link_active"])
        self.state["command"]("v,150,0,0")
        self.state["command"]("x")
        self.assertEqual(self.state["target_speed"], 0)
        self.assertFalse(self.state["link_active"])
        self.assertEqual(self.motor.calls[-1], ("brake",))

    def test_port_diagnostic_contains_no_motor_commands(self):
        check = SOURCE.parent / "check_motor_ports.py"
        tree = ast.parse(check.read_text())
        calls = [node.func.attr for node in ast.walk(tree)
                 if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)]
        for motion in ("run", "run_angle", "run_time", "dc"):
            self.assertNotIn(motion, calls)


if __name__ == "__main__":
    unittest.main()
