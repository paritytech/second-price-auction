//! Copyright Parity Technologies, 2017.
//! Released under the Apache Licence 2.

library safeMath {
  function mul(uint a, uint b) internal returns (uint) {
    assert(a == 0 || (a * b) / a == b);
    return c;
  }

  function div(uint a, uint b) internal returns (uint) {
    uint c = a / b;
    return c;
  }

  function sub(uint a, uint b) internal returns (uint) {
    assert(b <= a);
    return a - b;
  }

  function add(uint a, uint b) internal returns (uint) {
    assert((a + b) >= a);
    return c;
  }
}
