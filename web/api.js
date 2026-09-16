import { Stack } from './stack';

const stack = new Stack();

export function addRow(data) {
  stack.addRow(data);
}

export function updateOrder(order) {
  stack.updateOrder(order);
}

export function getRightNumber() {
  return stack.getRightNumber();
}