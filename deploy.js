const fs = require('fs')

const truebit = require('@truverse/contracts').mainnet

const { create: createIPFSClient } = require('ipfs-http-client')
const merkleRoot = require('truebit-util').merkleRoot.web3
const web3 = require('web3')

const wei = n => ethers.utils.parseEther(n.toString()).toString()

async function main() {
  const [deployer] = await ethers.getSigners()

  const taskName = 'reverse'

  console.log('Loading task...')
  const path = 'artifacts-task/truebit'
  const codeBuf = fs.readFileSync(`${path}/${taskName}.wasm`)
  const info = JSON.parse(fs.readFileSync(`${path}/${taskName}.wasm.json`))

  console.log('Uploading task to IPFS...')
  const ipfs = createIPFSClient('http://localhost:5001')
  const ipfsFile = await ipfs.add([{ content: codeBuf, path: 'task.wasm' }])

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

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.toString())
    process.exit(1)
  })
