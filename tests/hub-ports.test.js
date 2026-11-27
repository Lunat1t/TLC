import assert from 'node:assert/strict';
import test from 'node:test';
import {describeHubPorts, hubPortsSummary, isMissingMotor} from '../src/lib/hub-ports.ts';
import {parsePortsReport} from '../src/lib/controller-runtime.ts';

const ALL = ['A', 'B', 'C', 'D', 'E', 'F'];
const ready = (extra = {}) => ({transport: 'ready', sensorPortsKnown: true, ports: ['A', 'B'], sensorPorts: ['C', 'E'], sensorTypes: {C: 'ultrasonic', E: 'color', IMU: 'imu'}, ...extra});

test('parsePortsReport splits motors and typed sensors and ignores junk', () => {
  assert.deepEqual(parsePortsReport('A:motor,C:ultrasonic,F:force'), {ports: ['A'], sensorPorts: ['C', 'F'], sensorTypes: {C: 'ultrasonic', F: 'force'}});
  assert.deepEqual(parsePortsReport(''), {ports: [], sensorPorts: [], sensorTypes: {}});
  assert.deepEqual(parsePortsReport(',:x,B:,D:motor'), {ports: ['D'], sensorPorts: [], sensorTypes: {}});
});

test('describeHubPorts shows motor, sensor type and empty port when the hub is connected', () => {
  const view = describeHubPorts(ready(), ALL);
  assert.equal(view.live, true);
  assert.deepEqual(view.ports.map(p => [p.port, p.kind]), [['A', 'motor'], ['B', 'motor'], ['C', 'ultrasonic'], ['D', 'empty'], ['E', 'color'], ['F', 'empty']]);
  assert.equal(view.motorCount, 2);
  assert.equal(view.sensorCount, 2);
  assert.equal(hubPortsSummary(view), 'Моторов: 2 · датчиков: 2');
});

test('describeHubPorts reports unknown, not empty, when there is no link to the hub', () => {
  for (const transport of ['disconnected', 'connecting', 'uploading', 'starting-hub', 'connected', 'fault']) {
    const view = describeHubPorts(ready({transport}), ALL);
    assert.equal(view.live, false, transport);
    assert.ok(view.ports.every(p => p.kind === 'unknown'), transport);
    assert.equal(hubPortsSummary(view), 'Нет связи с хабом: порты неизвестны');
  }
  assert.equal(describeHubPorts(ready({sensorPortsKnown: false}), ALL).live, false);
});

test('isMissingMotor warns only on a live connection', () => {
  const live = describeHubPorts(ready(), ALL);
  assert.equal(isMissingMotor(live, 'A'), false);
  assert.equal(isMissingMotor(live, 'C'), true);
  assert.equal(isMissingMotor(live, 'D'), true);
  assert.equal(isMissingMotor(describeHubPorts(ready({transport: 'fault'}), ALL), 'D'), false);
});
