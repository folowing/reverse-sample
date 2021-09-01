// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@truverse/contracts/Truebit.sol";

contract Reverse {
  Truebit truebit;
  TRU tru;
  FileSystem filesystem;

  bytes32 codeFileID;
  uint256 blockLimit;

  uint256 minDeposit;
  uint256 solverReward;
  uint256 verifierTax;
  uint256 ownerFee;

  uint256 nonce;

  mapping(bytes32 => bytes) taskID_to_input;
  mapping(bytes => bytes32) input_to_fileID;

  event TaskCreated(bytes input);
  event TaskFinished(bytes input, bytes output);

  constructor(
    address truebit_address,
    address tru_address,
    address fs_address,
    bytes32 _codeFileID,
    uint256 _blockLimit,
    uint256 _minDeposit,
    uint256 _solverReward,
    uint256 _verifierTax,
    uint256 _ownerFee
  ) {
    truebit = Truebit(truebit_address);
    tru = TRU(tru_address);
    filesystem = FileSystem(fs_address);
    codeFileID = _codeFileID;
    blockLimit = _blockLimit;
    minDeposit = _minDeposit;
    solverReward = _solverReward;
    verifierTax = _verifierTax;
    ownerFee = _ownerFee;
  }

  function reverse(bytes memory input) public payable {
    uint256 deposit = protocolFee();

    require(tru.balanceOf(msg.sender) >= deposit, "You don't have enough TRU");
    require(tru.allowance(msg.sender, address(this)) >= deposit, "Not enough allowance to spend your TRU");

    tru.transferFrom(msg.sender, address(this), deposit);
    tru.approve(address(truebit), deposit);
    truebit.makeDeposit(deposit);

    nonce += 2;

    filesystem.addToBundle(nonce, filesystem.createFileFromBytes("input.txt", nonce, input));
    filesystem.addToBundle(nonce, filesystem.createFileFromBytes("output.txt", nonce + 1, ""));
    filesystem.finalizeBundle(nonce, codeFileID);
    bytes32 bundleID = filesystem.calculateId(nonce);

    bytes32 taskID = truebit.createTaskId(bundleID, minDeposit, solverReward, verifierTax, ownerFee, blockLimit);
    truebit.requireFile(taskID, filesystem.hashName("output.txt"), 0);
    truebit.submitTask{value: platformFee()}(taskID);

    taskID_to_input[taskID] = input;
    emit TaskCreated(input);
  }

  function solved(bytes32 taskID, bytes32[] calldata files) external {
    require(Truebit(msg.sender) == truebit);
    bytes memory input = taskID_to_input[taskID];
    input_to_fileID[input] = files[0];
    emit TaskFinished(input, getOutput(input));
  }

  function cancelled(bytes32 taskID) external {
    require(Truebit(msg.sender) == truebit);
    bytes memory input = taskID_to_input[taskID];
    emit TaskFinished(input, "(cancelled)");
  }

  function getOutput(bytes memory input) public view returns (bytes memory) {
    bytes32 fileID = input_to_fileID[input];
    if (fileID == 0) {
      return "";
    }
    bytes32[] memory output = filesystem.getBytesData(fileID);
    bytes memory result = new bytes(0);
    for (uint256 i = 0; i < output.length; i++) {
      result = bytes.concat(result, output[i]);
    }
    return result;
  }


  function protocolFee() public view returns (uint256) {
    return solverReward + verifierTax + ownerFee;
  }

  function platformFee() public view returns (uint256) {
    return truebit.PLATFORM_FEE_TASK_GIVER();
  }
}
