# Truebit sample task in C++

In this tutorial, we are going to write a simple program in C++ that reverses some text (for example, if you have a string `abc123`, it'll return `321cba`). A user can then some text to our contract and it will ask Truebit to execute the program off-chain.

In this tutorial, we're going to write such a program in C++ from scratch and call it from a Solidity smart contract.

Please follow [this tutorial](https://www.reddit.com/r/truebit/comments/pc247f/truebit_development_environment_by_forking_mainnet/) first how to set up your local development environment.

## Compilation

First, we need to write our program in C++ and compile it to WebAssembly.

Let's open a new shell and make sure we're using the correct node.js version.

```
docker exec -it truebit bash
source ~/.nvm/nvm.sh
nvm use default
```

We'll call the program `reverse` and it'll live in the `tutorial` directory.

```
cd /tutorial
mkdir reverse
cd reverse
```

Create a file `reverse.cpp`. That's our program. It reads a line from `input.txt`, reverses it and saves it to `output.txt`.

```cpp
#include <fstream>
#include <string>

int main() {
  std::ifstream input_file("input.txt");
  std::string input;
  std::getline(input_file, input);
  std::string reversed(input.rbegin(), input.rend());
  std::ofstream output_file("output.txt");
  output_file << reversed;
  return 0;
}
```

Let's test that it works.

```
$ mkdir build && cd build
$ mkdir native && cd native

$ g++ ../../reverse.cpp -o reverse

$ echo abc > input.txt
$ cat input.txt
abc
$ ./reverse
$ cat output.txt
cba

$ cd ..
```

Now we need to compile it to WebAssembly.

We can replace `g++` with `em++`. But `em++` is an alias to `emcc` so let's just always use `emcc` for simplicity (which stands for Emscripten Compiler like `gcc` stands for GNU Compiler Collection).

```
$ mkdir wasm && cd wasm
$ emcc -s WASM=1 ../../reverse.cpp -o reverse.js
$ ls -lh
-rw-r--r-- 1 root root 283K reverse.js
-rw-r--r-- 1 root root 393K reverse.wasm
```

First time you run it, it will compile some system libraries but they'll be cached and it'll be much faster next time.

Without `-s WASM=1`, it only generates `reverse.js` and not `reverse.wasm`. We need the `.wasm` file. We don't need the `.js` file.

To test that our program also works correctly in WebAssembly, we can run the following:

```
$ echo abc > input.txt
$ cat input.txt
abc

$ touch output.txt

$ node /truebit-eth/emscripten-module-wrapper/prepare.js reverse.js \
  --run --debug \
  --asmjs \
  --file input.txt --file output.txt

$ cd ..
```

In the output you should see the answer somewhere:

```
stderr: DEBUG: output.txt
DEBUG: 1000146
DEBUG: cba
```

Note that the `output.txt` has to exist even though it's later created by the program. You get an error if it doesn't exist.

`--run` executes the program, obviously.

`--debug` shows which WebAssembly off-chain interpreter commands are launched.

It's not clear to me why `--asmjs` is needed, it simply does not work without it.

In the output, you also see some JSON:

```json
{
  "vm": {
    "code": "0x60c88bbde88ff92034562e50e3bdbc5c44485ebef9fe3fd2e3ead99ba90aee83",
```

`vm.code` is a hash that's the value for the `codeRoot` parameter that will be needed when deploying the program to Truebit. Not sure what everything else is used for.

Truebit uses its own flavor of WebAssembly. It needs to process the generated `.wasm` file, that's we need to use the `prepare.js` command. In this case, this command executed the program but did not generate anything, we need to rerun it with `--out`.

The JSON file gets printed to standard output and we'll store it because we'll need the `vm.code` hash later.

```
$ mkdir truebit

$ node /truebit-eth/emscripten-module-wrapper/prepare.js wasm/reverse.js \
  --out wasm-truebit --asmjs > truebit/reverse.wasm.json
```

There are multiple files generated but we only need `globals.wasm`.

```
$ ls -lh wasm-truebit/
-rw-r--r-- 1 root root 411K globals.wasm
-rw-r--r-- 1 root root 411K merge.wasm
-rw-r--r-- 1 root root 291K prepared.js
-rw-r--r-- 1 root root 283K reverse.js
-rw-r--r-- 1 root root 393K reverse.wasm

$ cp wasm-truebit/globals.wasm truebit/reverse.wasm
```

In `build/truebit`, we should now have all the necessary build artifacts:

```
$ ls -lh truebit/
-rw-r--r-- 1 root root 1.1K reverse.wasm.json
-rw-r--r-- 1 root root 411K reverse.wasm
```

Clean up:

```
cd ..
rm -rf build
```

## Project setup

Let's use Hardhat to compile and deploy our contracts.

Create `package.json`.

```json
{
  "private": true,
  "scripts": {
    "compile-native": "mkdir -p artifacts-task/native && cd artifacts-task/native && g++ ../../reverse.cpp -o reverse",
    "compile-wasm": "mkdir -p artifacts-task/wasm && cd artifacts-task/wasm && emcc -s WASM=1 ../../reverse.cpp -o reverse.js",
    "compile-truebit": "mkdir -p artifacts-task/truebit artifacts-task/wasm-truebit && cd artifacts-task && node /truebit-eth/emscripten-module-wrapper/prepare.js wasm/reverse.js --out wasm-truebit --asmjs > truebit/reverse.wasm.json && cp wasm-truebit/globals.wasm truebit/reverse.wasm",
    "compile": "npm run compile-wasm && npm run compile-truebit",
    "clean": "rm -rf artifacts-task"
  }
}
```

We can now compile our code with just one command:

```
npm run compile
```

We're now using the `artifacts-task` directory for build artifacts. Hardhat uses `artifacts` and we'll use a similar name. It doesn't go well when we put our files in Hardhat's `artifacts`, hence a separate but similarly named `artifacts-task`. To clean up everything, run `npm run clean`.

Install Hardhat.

```
npm install hardhat ethers @nomiclabs/hardhat-ethers --save-dev
```

Install some packages that we'll need for deployment.

```
npm install ipfs-http-client truebit-util web3 --save-dev
```

Install a community package that conveniently has all the Truebit contract interfaces and ABI files.

```
npm install @truverse/contracts --save-dev
```

Create `hardhat.config.js`.

```js
require('@nomiclabs/hardhat-ethers')

module.exports = {
  solidity: '0.8.4',
  defaultNetwork: 'localhost',
  networks: {
    localhost: {
      url: 'http://localhost:8545'
    }
  }
}
```

`0.8.4` is the latest supported Solidity version supported by Hardhat at the time of writing.

We're going to connect to `localhost:8545` which runs our mainnet fork.

## Contract

Alright, let's start writing some Solidity code.

Create `contracts/Reverse.sol`.

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@truverse/contracts/Truebit.sol";

contract Reverse {
  Truebit truebit;
  TRU tru;
  FileSystem filesystem;

  ...

  constructor(
    address truebit_address,
    address tru_address,
    address fs_address,
    ...
  ) {
    truebit = Truebit(truebit_address);
    tru = TRU(tru_address);
    filesystem = FileSystem(fs_address);
    ...
  }

  ...
}
```

This is the basics.

`Truebit` is the incentive layer. We call this contract to submit tasks and it will get back to us with the result.

`TRU` is the protocol token. It's an ERC20 token. It's needed to pay protocol fees.

`FileSystem` is the file system contract. We are going to use it to add an input file, get the content of the output file as well as the set the task file that'll be executed.

The addresses of these contracts vary across networks so it makes sense to have them as contructor arguments.

Next, some parameters related to our program that will be executed.

```solidity
contract Reverse {
  ...

  bytes32 codeFileID;
  uint256 blockLimit;

  constructor(
    ...
    bytes32 _codeFileID,
    uint256 _blockLimit
  ) {
    ...
    codeFileID = _codeFileID;
    blockLimit = _blockLimit;
  }

  ...
}
```

`codeFileID` stores the file system file ID of the program or code that will be executed.

`blockLimit` is the length of time (in blocks) for which solvers and verifiers will attempt to run the task before reporting a timeout.

Next, let's add a way to configure how much we pay in protocol fees.

```solidity
contract Reverse {
  ...

  uint256 minDeposit;
  uint256 solverReward;
  uint256 verifierTax;
  uint256 ownerFee;

  constructor(
    ...
    uint256 _minDeposit,
    uint256 _solverReward,
    uint256 _verifierTax,
    uint256 _ownerFee
  ) {
    ...
    minDeposit = _minDeposit;
    solverReward = _solverReward;
    verifierTax = _verifierTax;
    ownerFee = _ownerFee;
  }

  ...

  function protocolFee() public view returns (uint256) {
    return solverReward + verifierTax + ownerFee;
  }

  function platformFee() public view returns (uint256) {
    return truebit.PLATFORM_FEE_TASK_GIVER();
  }
}
```

`minDeposit` is the minimum unbonded deposit that solvers and verifiers must have staked in the Incentive Layer in order participate. If solvers cheat or don't solve tasks on time, they get slashed. We want to set the `minDeposit` to high enough that it's painful to be slashed, yet low enough so that there is actually a participant that has bonded that many tokens.

The `solverReward` is the reward paid to the solver for a correct computation. We want to reward them for solving our tasks. The `verifierTax` is the fee split among verifiers, we need verifiers to make sure the solver did its job correctly so it's like a tax we pay.

The `ownerFee` is the fee paid by the task submitter to the smart contract issuing the task (if any). In our case, we are going to create the task in the smart contract and so we are going to be the owner. When the user asks the contract to reverse a string, they are the task submitter. Both will take place in the same method in our tutorial. So when we are asking the user to pay the protocol fees (solver reward and verifier tax) we can also ask them to pay us a fee for having made the contract and that'll be the task owner fee. We can also set it to `0`.

`minDeposit`, `solverReward`, `verifierTax`, `ownerFee` are TRU tokens.

Here we set them in stone when we deploy the contract, but you could also make them configurable or perhaps they could be paramaters for each submitted task. In this tutorial, we're keeping it simple. In the real world, the value of ETH and TRU will flunctuate so after a while the rewards we specified may be too small to incentivize solvers, this is why in real world contracts this should be adjusted over time.

We also expose two convenience methods `protocolFee()` (how much you need to deposit in TRU) and `platformFee()` (how much you pay to Truebit, the company, in ETH). What's nice is that `protocolFee` and `platformFee` are the same length, they look nice when they're together in code.

Let's add some other methods.

```solidity
contract Reverse {
  ...

  event TaskCreated(bytes input);
  event TaskFinished(bytes input, bytes output);

  ...

  function reverse(bytes memory input) public payable {
    ...
    emit TaskCreated(input);
  }

  function solved(bytes32 taskID, bytes32[] calldata files) external {
    ...
    emit TaskFinished(input, getOutput(input));
  }

  function cancelled(bytes32 taskID) external {
    ...
    emit TaskFinished(input, "(cancelled)");
  }

  function getOutput(bytes memory input) public view returns (bytes memory) {
    ...
  }

  ...
}
```

`reverse(input)` is the method that our users will call. They'll pass a string as bytes that we'll reverse off-chain. This will emit a `TaskCreated` event.

`solved` will be called by Truebit (the incentive layer) when the task has been solved and we have the result. We emit a `TaskFinished` event.

`cancelled` will be called by Truebit when it was not possible to solve the task. In this tutorial, we'll also emit a `TaskFinished` event but we'll set the result to `(cancelled)`.

The result is stored on-chain and you can get it with `getOutput` at any time if you missed the event.

We're not doing it here in this tutorial but you could change `reverse` to take `solverReward`, `verifierTax` etc. for each task.

Let's start building the function to submit tasks. That's the meat of the contract.

```solidity
contract Reverse {
  ...

  function reverse(bytes memory input) public payable {
    uint256 deposit = protocolFee();

    require(tru.balanceOf(msg.sender) >= deposit, "You don't have enough TRU");
    require(tru.allowance(msg.sender, address(this)) >= deposit, "Not enough allowance to spend your TRU");

    tru.transferFrom(msg.sender, address(this), deposit);
    tru.approve(address(truebit), deposit);
    truebit.makeDeposit(deposit);

    ...
  }

  ...
}
```

We need to deposit all protocol fees into the incentive layer. Our convenience function `protocolFee()` is useful also inside the contract.

The protocol fees are paid in TRU which is an ERC20 token. This means that we need to transfer the required amount of TRU tokens to the contract which will then be transferred to the incentive layer with `truebit.makeDeposit(deposit)`.

There are two ways to make it happen that come to mind right now:

1) User transfers TRU to the `Reverse` contract and they'll then be transferred to the incentive layer. If the task creation fails and the user already sent their TRU, there should be a way to get it back. In Truebit samples, what they do to avoid this is to split the task creation methods into multiple ones: create task and then submit it.

2) User allows the `Reverse` contract to spend their TRU and we transfer tokens from the user to the contract and then they'll be transfered to the incentive layer. Either everything in the method happens (token transfer, deposits, task creation) or nothing happens, like in an atomic transaction, so there's no need to worry about returning tokens in case of failure. I like this method more but I believe it may cost a bit more gas. We are doing this in this tutorial.

You could also move `tru.approve()` to the constructor and use the max integer value to save a bit of gas. But then the incentive layer could rob you lol.

Next, we create a bundle that holds references to our input file and output file, as well as the task file that will be executed.

```solidity
contract Reverse {
  ...

  uint256 nonce;

  ...

  function reverse(bytes memory input) public payable {
    ...

    nonce += 2;

    filesystem.addToBundle(nonce, filesystem.createFileFromBytes("input.txt", nonce, input));
    filesystem.addToBundle(nonce, filesystem.createFileFromBytes("output.txt", nonce + 1, ""));
    filesystem.finalizeBundle(nonce, codeFileID);
    bytes32 bundleID = filesystem.calculateId(nonce);

    ...
  }

  ...
}
```

Each file and bundle needs a unique identifier. They call this `nonce`. I'm not sure exactly how it works: what happens if you use the same nonce for multiple files or why it's ok for the bundle and file to have the same `nonce`.

We create a file called `input.txt` that our program reads from. The user will convert their text to UTF-8 bytes and call this function. We set the content of the file to these bytes. They are stored on-chain so it's expensive. You'd only pass very small amounts of data like this.

We create a file called `output.txt` and set its value to an empty string. It's not clear to me why this needs to be done but it seems that you need to define output files but for some reason you also need to set their content. What's done with this content is not clear to me.

Finally, `codeFileID` is the ID of the file that'll be executed. That's our program in WebAssembly. It was defined in the constructor. As you'll see in the next section, before we deploy the contract, we upload the wasm file to IPFS and then add it to the filesystem contract. The ID of the file in the filesystem contract is `codeFileID`.

What we need to do then is to create a task and submit it.

```solidity
contract Reverse {
  ...

  function reverse(bytes memory input) public payable {
    ...

    bytes32 taskID = truebit.createTaskId(bundleID, minDeposit, solverReward, verifierTax, ownerFee, blockLimit);
    truebit.requireFile(taskID, filesystem.hashName("output.txt"), 0);
    truebit.submitTask{value: platformFee()}(taskID);

    ...
  }

  ...
}
```

`bundleID` represents all the input and output files, bundled into one ID. We also set the reward/tax/fee/limit for the task.

`requireFile` means that the solver will need to upload this file. The last argument is the file type and `0` stands for bytes. Not sure why we need to use some hash instead of `nonce`.

Finally, we submit the task and only then it'll be picked up by solvers and verifiers. Note that we need to send some ETH along with it, that's the platform fee that Truebit, the company, gets to keep. It's currently 0.005 ETH.

Let's add some more code so we know which tasks refer to what input and also handle the result.

```solidity
contract Reverse {
  ...

  mapping(bytes32 => bytes) taskID_to_input;
  mapping(bytes => bytes32) input_to_fileID;

  ...

  function reverse(bytes memory input) public payable {
    ...

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
    ...
  }
  
  ...
}
```

`taskID_to_input` maps task ID to the user input.

We use it in `solved` and `cancelled` callback methods to get the task input and emit an event with both the original input and the output.

In `solved` and `cancelled`, we make sure that only the Truebit's incentive layer is allowed to call these callback functions.

If successful, in `solved`, we store the result in `input_to_fileID`. We could also store the output directly instead of some file ID, but the output is already stored on-chain in the filesystem contract so there's no need to pay more and store it twice. This duplicate data will live forever until the end of time.

There can be multiple output files but we know we only have one so we use `files[0]`.

Finally, we have `getOutput` that retrieves the output file from the filesystem and converts it to bytes.

```solidity
contract Reverse {
  ...

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
  
  ...
}
```

The output file consists of a variable length array of 32-byte pieces. What we want to do is to combine them and then they can be converted to text. This is what this code does. Note that `bytes.concat` requires a recent Solidity version, I believe `>= 0.8.x`.

There's `filesystem.getFormattedBytesData` and I thought it does exactly that but I guess I was wrong. I have no idea what it's for.

This is not efficient and consumes a bit of gas and so you could also do this on the client side. Note that there'll be a bunch of zero bytes at the end, we don't trim them here.

And that's it! About 100 lines of code.

We can compile it like this:

```
$ npx hardhat compile
Downloading compiler 0.8.4
Compiling 2 files with 0.8.4
Compilation finished successfully
```

## Deployment

Hardhat suggests putting scripts in a `scripts/` folder but typing `scripts/deploy.js` all the time is annoying so we'll put them in the root folder.

Create `deploy.js`.

```js
const fs = require('fs')

const truebit = require('@truverse/contracts').mainnet

const {create: createIPFSClient} = require('ipfs-http-client')
const merkleRoot = require('truebit-util').merkleRoot.web3
const web3 = require('web3')

const wei = n => ethers.utils.parseEther(n.toString()).toString()

...
```

We'll upload the program file to IPFS, so we need a client for that.

`merkleRoot` is a JavaScript function that calculates some hash. It uses a hash function that it takes from `web3`. This function is in the `truebit-util` npm package. In this deployment, we are going to use ethers not web3 so it's not elegant to pull in `web3` just for that. I'd argue `truebit-util` needs some usability love.

We'll do everything in the `main` function:

```js
async function main() {
  const [deployer] = await ethers.getSigners()

  ...
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.toString())
    process.exit(1)
  })
```

Next, we load the program file and upload it to IPFS.

```js
async function main() {
  ...

  const taskName = 'reverse'

  console.log('Loading task...')
  const path = 'artifacts-task/truebit'
  const codeBuf = fs.readFileSync(`${path}/${taskName}.wasm`)
  const info = JSON.parse(fs.readFileSync(`${path}/${taskName}.wasm.json`))

  console.log('Uploading task to IPFS...')
  const ipfs = createIPFSClient('http://localhost:5001')
  const ipfsFile = await ipfs.add([{content: codeBuf, path: 'task.wasm'}])
```

Then we register the program file in the filesystem contract. Pick a higher `blockLimit` because are mining blocks much faster than on the real mainnet.

```js
async function main() {
  ...

  const name = ipfsFile.path
  const ipfsHash = ipfsFile.cid.toString()
  const size = codeBuf.byteLength
  const mr = merkleRoot(web3, codeBuf)
  const nonce = Date.now()
  const codeRoot = info.vm.code
  const codeType = 1 // 1=wasm
  const memorySize = 25
  const stackSize = 20
  const globalsSize = 8
  const tableSize = 20
  const callSize = 10

  console.log('Adding task to filesystem contract...')
  const truebitFS = new ethers.Contract(truebit.filesystem.address, truebit.filesystem.abi, deployer)

  await truebitFS.addIpfsFile(name, size, ipfsHash, mr, nonce)
  await truebitFS.setCodeRoot(nonce, codeRoot, codeType, stackSize, memorySize, globalsSize, tableSize, callSize)
  const codeFileID = await truebitFS.calculateId(nonce)
  const blockLimit = 3

  ...
```

Then we just deploy the contract. Contract addresses, task file ID and reward/tax/fee/limit are arguments to the constructor.

```js
async function main() {
  ...

  console.log('Deploying...')
  const Reverse = await ethers.getContractFactory('Reverse')

  const minDeposit = wei(100)
  const solverReward = wei(100)
  const verifierTax = wei(50)
  const ownerFee = wei(0)

  const contract = await Reverse.deploy(
    truebit.incentive.address,
    truebit.tru.address,
    truebit.filesystem.address,
    codeFileID,
    blockLimit,
    minDeposit,
    solverReward,
    verifierTax,
    ownerFee
  )

  await contract.deployed()

  console.log('Contract address:', contract.address)
  fs.writeFileSync('.address', contract.address)
}
```

We store the deployed contract address is a `.address` file for convenience.

We can run it like this:

```
$ npx hardhat run deploy.js
Loading task...
Uploading task to IPFS...
Adding task to filesystem contract...
Deploying...
Contract address: 0xCf1205c204D91B1202850530e5f43Fe76CDB9575

$ cat .address
0xCf1205c204D91B1202850530e5f43Fe76CDB9575
```

## Usage

Create `reverse.js`. That's our user interface in this tutorial. In a real world application, this would be some web UI instead.

```js
const fs = require('fs')
const truebit = require('@truverse/contracts').mainnet

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const [deployer] = await ethers.getSigners()

  const reverse = await hre.artifacts.readArtifact('Reverse')
  const reverseAddress = fs.readFileSync('.address', 'utf-8')

  const contract = new ethers.Contract(reverseAddress, reverse.abi, deployer)
  const tru = new ethers.Contract(truebit.tru.address, truebit.tru.abi, deployer)

  console.log(`Contract address: ${reverseAddress}`)
  console.log()
  console.log('TRU balance', ethers.utils.formatEther(await tru.balanceOf(deployer.address)).toString())
  console.log()

  ...
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.toString())
    process.exit(1)
  })
```

There's some code that overlaps with `deploy.js`. Perhaps we could move it to a shared code file.

```js
async function main() {
  ...

  const protocolFee = await contract.protocolFee()
  const platformFee = await contract.platformFee()

  console.log(`Protocol fee: ${ethers.utils.formatEther(protocolFee)} TRU`)
  console.log(`Platform fee: ${ethers.utils.formatEther(platformFee)} ETH`)
  console.log()

  console.log(`Allowing smart contract to spend our TRU tokens to pay protocol fees...`)
  console.log()
  const trutx = await tru.approve(contract.address, protocolFee.toString())
  await trutx.wait()

  ...
```

Our convience methods for getting the fees are very useful now, as you can see.

We first need to allow the contract to spend our TRU.

We can then submit the task

```js
async function main() {
  ...

  const input = 'abc123'

  console.log(`Submitting task to reverse "${input}"`)
  const tx = await contract.reverse(ethers.utils.toUtf8Bytes(input), {value: platformFee.toString()})
  await tx.wait()

  console.log('Submitted')
  console.log()

  ...
```

We convert our input text to UTF-8 bytes and call the contract method.

We need to send some ETH to the contract when calling the method which will go to Truebit, the company.

If you have Truebit OS running, then the task should be picked up by a solver right away.

```js
async function main() {
  ...

  while (true) {
    console.log('Waiting...')
    const output = await contract.getOutput(ethers.utils.toUtf8Bytes(input))
    if (output != '0x') {
      console.log()
      console.log('Result:', ethers.utils.toUtf8String(output))
      break
    }
    await sleep(3000)
  }
}
```

Finally we wait until we get the result.

You could also listen for the `TaskFinished` event.

Alright. Make sure you have a solver and verifier running in Truebit OS. Make sure the first account has a number of TRU tokens. It will take about a minute or two for the result to show up.

Usage:

```
$ npx hardhat run reverse.js
Contract address: 0xCf1205c204D91B1202850530e5f43Fe76CDB9575

TRU balance 9000.0

Protocol fee: 150.0 TRU
Platform fee: 0.005 ETH

Allowing smart contract to spend our TRU tokens to pay protocol fees...

Submitting task to reverse "abc123"...
Submitted

Waiting...
Waiting...
...
Waiting...
Waiting...

Result: 321cba
```

It reads the contract address from the `.address` file and the input is hardcoded as a variable `input` in `reverse.js`.

## Conclusion

That's it!

While the program is very simple it is very powerful.

You can replace the code in `reverse.cpp` with much more complex calculations.

If the data you send to the task and get back from the task are small, you can store them on-chain as bytes like we did in this tutorial. If your files are large, then you'll need to store them on IPFS. That's a topic for another tutorial.

## Appendix

### npm scripts

```json
{
  "scripts": {
    "compile-native": "mkdir -p artifacts-task/native && cd artifacts-task/native && g++ ../../reverse.cpp -o reverse",
    "compile-wasm": "mkdir -p artifacts-task/wasm && cd artifacts-task/wasm && emcc -s WASM=1 ../../reverse.cpp -o reverse.js",
    "compile-truebit": "mkdir -p artifacts-task/truebit artifacts-task/wasm-truebit && cd artifacts-task && node /truebit-eth/emscripten-module-wrapper/prepare.js wasm/reverse.js --out wasm-truebit --asmjs > truebit/reverse.wasm.json && cp wasm-truebit/globals.wasm truebit/reverse.wasm",
    "compile-contracts": "npx hardhat compile",
    "compile": "npm run compile-wasm && npm run compile-truebit && npm run compile-contracts",
    "clean": "rm -rf artifacts artifacts-task cache .address",
    "deploy": "npx hardhat run deploy.js",
    "reverse": "npx hardhat run reverse.js"
  },
```

### Without `@truverse/contracts`

If you don't want to use the `@truverse/contracts` community package, here's how to do it from scratch.

We'll need Truebit contract addresses and ABIs. Let's copy the mainnet config file.

```
mkdir -p config
cp /truebit-eth/wasm-client/mainnet.json config/mainnet.json
```

We need to have Truebit contract interfaces in Solidity that we are going to use in our contract. There doesn't seem to have a nice public package or anything like this so we're going to use `abi-to-sol` to convert ABI from JSON to Solidity.

Here's how we can do it. The result is in the `contracts/Truebit.sol` file. Not pretty but it works.

```
mkdir -p contracts
echo "// SPDX-License-Identifier: UNLICENSED" > contracts/Truebit.sol
echo "pragma solidity >=0.5.0;" >> contracts/Truebit.sol
jq .incentiveLayer.abi config/mainnet.json | npx abi-to-sol Truebit | grep -Ev 'SPDX-License-Identifier|pragma' >> contracts/Truebit.sol
jq .tru.abi config/mainnet.json | npx abi-to-sol TRU | grep -Ev 'SPDX-License-Identifier|pragma' >> contracts/Truebit.sol
jq .fileSystem.abi config/mainnet.json | npx abi-to-sol FileSystem | grep -Ev 'SPDX-License-Identifier|pragma' >> contracts/Truebit.sol
```

Use it like this:

```solidity
import "./Truebit.sol";
```

Note that our generated file causes some harmless warnings when compiling contracts:

```
Warning: This declaration has the same name as another declaration.
  --> contracts/Truebit.sol:312:25:
    |
312 |     function initialize(string memory name, string memory symbol) external;
    |                         ^^^^^^^^^^^^^^^^^^
Note: The other declaration is here:
  --> contracts/Truebit.sol:316:5:
    |
316 |     function name() external view returns (string memory);
    |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Warning: This declaration has the same name as another declaration.
  --> contracts/Truebit.sol:312:45:
    |
312 |     function initialize(string memory name, string memory symbol) external;
    |                                             ^^^^^^^^^^^^^^^^^^^^
Note: The other declaration is here:
  --> contracts/Truebit.sol:326:5:
    |
326 |     function symbol() external view returns (string memory);
    |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

We could rename them to `_name` and `_symbol` with `sed`.
Alternatively we could import and use OpenZeppelin's `ERC20` interface instead.

In the deployment script, you can load the ABI and mainnet addresses like this:

```js
const network = fs.readFileSync('config/mainnet.json')
const truebitFS = new ethers.Contract(network.fileSystem.address, network.fileSystem.abi, deployer)
```

### Truebit OS logs

```
[17:50:33] info: SOLVER [TASK 0x5aa]: Task 0x5aae6584bb74347451ce82bf4c674b47b50c0e84d885df23973fe5f678caab3e has been posted with Solver reward 90, minimum deposit 100, and blockLimit 3 (r
atio 30).  Checking for availability, setting up VM, and retrieving file(s).
[17:50:33] info: VERIFIER [TASK 0x5aa]: Task 0x5aae6584bb74347451ce82bf4c674b47b50c0e84d885df23973fe5f678caab3e has been posted with Verifier tax 45, minimum deposit 100, and blockLimit 3 (ratio 15).
[17:50:33] info: VERIFIER [TASK 0x5aa]: Setting up VM and retrieving files.
Getting file { name: 'task.wasm', size: 420357, type: 'IPFS' }
Getting file { name: 'task.wasm', size: 420357, type: 'IPFS' }
Getting file { name: 'input.txt', size: 6, type: 'bytes' }
Getting file { name: 'input.txt', size: 6, type: 'bytes' }
Getting file { name: 'output.txt', size: 0, type: 'bytes' }
Getting file { name: 'output.txt', size: 0, type: 'bytes' }
Executing: ./../wasm-client/ocaml-offchain/interpreter/wasm -m -disable-float -input -memory-size 25 -stack-size 20 -table-size 20 -globals-size 8 -call-stack-size 10 -file output.txt -file input.txt -wasm task.wasm
Executing: ./../wasm-client/ocaml-offchain/interpreter/wasm -m -disable-float -input -memory-size 25 -stack-size 20 -table-size 20 -globals-size 8 -call-stack-size 10 -file output.txt -file input.txt -wasm task.wasm
[17:50:41] info: SOLVER [TASK 0x5aa]: Created local directory: /truebit-eth/tmp.solver_pf0fkrrpqso0
[17:50:44] info: SOLVER [TASK 0x5aa]: I successfully registered for this task.
[17:50:44] info: VERIFIER [TASK 0x5aa]: Created local directory: /truebit-eth/tmp.verifier_49cik5hjqpg0
[17:50:44] info: VERIFIER [TASK 0x5aa]: Waiting for Solver's solution.
[17:50:51] info: SOLVER [TASK 0x5aa]: Ending Solver selection period.
Waiting...
[17:50:53] info: VERIFIER [TASK 0x5aa]: Solver with address 0xc937fd2dddb842ec13de0ab6aba87a19e60790d8 has been selected.
[17:50:53] info: SOLVER [TASK 0x5aa]: My address 0xc937Fd2dddB842eC13De0AB6ABA87A19E60790d8 was selected as Solver!  Solving task...
Executing: ./../wasm-client/ocaml-offchain/interpreter/wasm -m -disable-float -output-io -memory-size 25 -stack-size 20 -table-size 20 -globals-size 8 -call-stack-size 10 -file output.txt -file input.txt -wasm task.wasm
[17:50:58] info: SOLVER [TASK 0x5aa]: Committing solution 0x6cfb673ee3e1939c878d11a7311927664cd5a490acf0f61209794adea20c02f6 (hashed with private random bits 0xed2cec20e9a73030e6d1b653706c9399923557f8e957e7240bce9a400574f08c)
[17:51:00] info: VERIFIER [TASK 0x5aa]: Solution has been posted.
[17:51:00] info: VERIFIER [TASK 0x5aa]: Verifying task.
Executing: ./../wasm-client/ocaml-offchain/interpreter/wasm -m -disable-float -output-io -memory-size 25 -stack-size 20 -table-size 20 -globals-size 8 -call-stack-size 10 -file output.txt -file input.txt -wasm task.wasm
[17:51:00] info: SOLVER [TASK 0x5aa]: I successfully committed my solution hash.
Solver paid 0.005 ETH platform fee.
[17:51:06] info: VERIFIER [TASK 0x5aa]: Got solution: 0x6cfb673ee3e1939c878d11a7311927664cd5a490acf0f61209794adea20c02f6
[17:51:09] info: VERIFIER [TASK 0x5aa]: I successfully committed my challenge hash.
[17:51:29] info: SOLVER [TASK 0x5aa]: Ending Verifier challenge period.
Waiting...
[17:51:35] info: VERIFIER [TASK 0x5aa]: I revealed my challenge intent.
[17:51:51] info: SOLVER [TASK 0x5aa]: Ending Verifier reveal period.
Waiting...
[17:51:53] info: SOLVER [TASK 0x5aa]: Challenge reveal period has ended.  Task has 1 Verifier(s).
[17:51:53] info: VERIFIER [TASK 0x5aa]: Challenge reveal period has ended.  Task has 1 Verifier(s).
[17:51:57] info: SOLVER [TASK 0x5aa]: Uploading output file(s)...
[17:51:57] info: VERIFIER [TASK 0x5aa]: Solver revealed solution 0x6cfb673ee3e1939c878d11a7311927664cd5a490acf0f61209794adea20c02f6.
[17:51:57] info: SOLVER [TASK 0x5aa]: I successfully revealed my committed solution.
Executing: ./../wasm-client/ocaml-offchain/interpreter/wasm -m -disable-float -input2 -input-proofs -memory-size 25 -stack-size 20 -table-size 20 -globals-size 8 -call-stack-size 10 -file output.txt -file input.txt -wasm task.wasm
[17:51:58] info: VERIFIER [TASK 0x5aa]: Jackpot!!
Found upload proof for task 0x5aae6584bb74347451ce82bf4c674b47b50c0e84d885df23973fe5f678caab3e
{ name: 'output.txt.out', type: 'bytes' }
[17:52:03] info: VERIFIER [TASK 0x5aa]: My account 0x297a2f88aef8b447c3f01974230c3d8885cc6f6d received jackpot of 179.828446913192726072 TRU.
Adding bytes file: {
  name: 'output.txt',
  size: 6,
  fileID: '0xc4099e2b222696e29d617ed29fe762fe29c97ad3f59e223e930a03db0739a071',
  transactionHash: '0x32cd2d4b379f02891bc7f4bc36336c19f0f7cca17243b959491bde714a3e491e',
  data: [ '0x333231636261' ]
}
[17:52:03] info: SOLVER [TASK 0x5aa]: Uploading output.txt of size 6 to fileID 0xc4099e2b222696e29d617ed29fe762fe29c97ad3f59e223e930a03db0739a071.
[17:52:03] info: SOLVER [TASK 0x5aa]: All outputs have been uploaded.
[17:52:07] info: SOLVER [TASK 0x5aa]: Finalizing task.
Waiting...
[17:52:10] info: SOLVER [TASK 0x5aa]: I received reward of 269.471643780005428705 TRU at address 0xc937fd2dddb842ec13de0ab6aba87a19e60790d8.
[17:52:13] info: SOLVER [TASK 0x5aa]: I successfully unbonded my 100 TRU deposit for task 0x5aae6584bb74347451ce82bf4c674b47b50c0e84d885df23973fe5f678caab3e.
[17:52:13] info: VERIFIER [TASK 0x5aa]: Task 0x5aae6584bb74347451ce82bf4c674b47b50c0e84d885df23973fe5f678caab3e was finalized. I successfully unbonded my deposit of 100 TRU.
```

## License

Apache 2.0
