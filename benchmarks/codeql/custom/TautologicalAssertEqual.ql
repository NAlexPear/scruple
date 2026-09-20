/**
 * @name Tautological assert.equal call
 * @description Finds the exact assert.equal(true, true) benchmark shape.
 * @kind problem
 * @problem.severity warning
 * @precision very-high
 * @id scruple/tautological-assert-equal
 * @tags maintainability
 */

import javascript

from CallExpr call, PropAccess callee, BooleanLiteral left, BooleanLiteral right
where
  callee = call.getCallee() and
  callee.getPropertyName() = "equal" and
  callee.getBase().toString() = "assert" and
  left = call.getArgument(0) and
  right = call.getArgument(1) and
  left.getValue() = "true" and
  right.getValue() = "true"
select call, "This assertion compares two literal true values."
