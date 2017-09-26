//! FrozenToken ECR20-compliant token contract
//! By Parity Technologies, 2017.
//! Released under the Apache Licence 2.

pragma solidity ^0.4.17;

// ECR20 standard token interface
contract Token {
	event Transfer(address indexed from, address indexed to, uint256 value);
	event Approval(address indexed owner, address indexed spender, uint256 value);

	function balanceOf(address _owner) public constant returns (uint256 balance);
	function transfer(address _to, uint256 _value) public returns (bool success);
	function transferFrom(address _from, address _to, uint256 _value) public returns (bool success);
	function approve(address _spender, uint256 _value) public returns (bool success);
	function allowance(address _owner, address _spender) public constant returns (uint256 remaining);
}

// From Owned.sol
contract Owned {
	modifier only_owner { require (msg.sender == owner); _; }

	event NewOwner(address indexed old, address indexed current);

	function setOwner(address _new) public only_owner { NewOwner(owner, _new); owner = _new; }

	address public owner = msg.sender;
}

// FrozenToken, ECR20 tokens that all belong to the owner for sending around
contract FrozenToken is Owned, Token {
	// this is as basic as can be, only the associated balance & allowances
	struct Account {
		uint balance;
		bool liquid;
	}

	// constructor sets the parameters of execution, _totalSupply is all units
	function FrozenToken(uint _totalSupply, address _owner) public
		when_no_eth
		when_non_zero(_totalSupply)
	{
		totalSupply = _totalSupply;
		owner = _owner;
		accounts[_owner].balance = totalSupply;
		accounts[_owner].liquid = true;
	}

	// balance of a specific address
	function balanceOf(address _who) public constant returns (uint256) {
		return accounts[_who].balance;
	}

	// make an account liquid: only liquid accounts can do this.
	function makeLiquid(address _to)
		public
		when_no_eth
		when_liquid(msg.sender)
		returns(bool)
	{
		accounts[_to].liquid = true;
		return true;
	}

	// transfer
	function transfer(address _to, uint256 _value)
		public
		when_no_eth
		when_owns(msg.sender, _value)
		when_liquid(msg.sender)
		returns(bool)
	{
		Transfer(msg.sender, _to, _value);
		accounts[msg.sender].balance -= _value;
		accounts[_to].balance += _value;

		return true;
	}

	// no default function, simple contract only, entry-level users
	function() public {
		assert(false);
	}

	// the balance should be available
	modifier when_owns(address _owner, uint _amount) {
		require (accounts[_owner].balance >= _amount);
		_;
	}

	// no ETH should be sent with the transaction
	modifier when_no_eth {
		require (msg.value == 0);
		_;
	}

	modifier when_liquid(address who) {
		require (accounts[who].liquid);
		_;
	}

	// a value should be > 0
	modifier when_non_zero(uint _value) {
		require (_value > 0);
		_;
	}

	// Available token supply
	uint public totalSupply;

	// Storage and mapping of all balances & allowances
	mapping (address => Account) accounts;

	// Conventional metadata.
	string public constant name = "Frozen Token";
	string public constant symbol = "FRZ";
	uint8 public constant decimals = 3;
}
