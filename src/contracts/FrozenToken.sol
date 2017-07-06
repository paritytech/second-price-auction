//! BasicCoin ECR20-compliant token contract
//! By Parity Team (Ethcore), 2016.
//! Released under the Apache Licence 2.

pragma solidity ^0.4.7;

// ECR20 standard token interface
contract Token {
	event Transfer(address indexed from, address indexed to, uint256 value);
	event Approval(address indexed owner, address indexed spender, uint256 value);

	function balanceOf(address _owner) constant returns (uint256 balance);
	function transfer(address _to, uint256 _value) returns (bool success);
	function transferFrom(address _from, address _to, uint256 _value) returns (bool success);
	function approve(address _spender, uint256 _value) returns (bool success);
	function allowance(address _owner, address _spender) constant returns (uint256 remaining);
}

// Owner-specific contract interface
contract Owned {
	event NewOwner(address indexed old, address indexed current);

	modifier only_owner {
		if (msg.sender != owner) throw;
		_;
	}

	address public owner = msg.sender;

	function setOwner(address _new) only_owner {
		NewOwner(owner, _new);
		owner = _new;
	}
}

// BasicCoin, ECR20 tokens that all belong to the owner for sending around
contract FrozenToken is Owned, Token {
	// this is as basic as can be, only the associated balance & allowances
	struct Account {
		uint balance;
		bool liquid;
	}

	// the balance should be available
	modifier when_owns(address _owner, uint _amount) {
		if (accounts[_owner].balance < _amount) throw;
		_;
	}

	// no ETH should be sent with the transaction
	modifier when_no_eth {
		if (msg.value > 0) throw;
		_;
	}

	modifier when_liquid(address who) {
		if (!accounts[who].liquid) throw;
		_;
	}

	// a value should be > 0
	modifier when_non_zero(uint _value) {
		if (_value == 0) throw;
		_;
	}

	// the base, tokens denoted in micros
	uint constant public base = 1000000;

	// available token supply
	uint public totalSupply;

	// storage and mapping of all balances & allowances
	mapping (address => Account) accounts;

	// constructor sets the parameters of execution, _totalSupply is all units
	function BasicCoin(uint _totalSupply, address _owner) when_no_eth when_non_zero(_totalSupply) {
		totalSupply = _totalSupply;
		owner = _owner;
		accounts[_owner].balance = totalSupply;
		accounts[_owner].liquid = true;
	}

	// balance of a specific address
	function balanceOf(address _who) constant returns (uint256) {
		return accounts[_who].balance;
	}

	// transfer
	function transferLiquid(address _to, uint256 _value)
		when_no_eth
		when_owns(msg.sender, _value)
		when_liquid(msg.sender)
		returns(bool)
	{
		Transfer(msg.sender, _to, _value);
		accounts[msg.sender].balance -= _value;
		accounts[_to].balance += _value;
		accounts[_to].liquid = true;
		return true;
	}

	// transfer
	function transfer(address _to, uint256 _value)
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
	function() {
		throw;
	}
}
