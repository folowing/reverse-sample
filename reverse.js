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

  const protocolFee = await contract.protocolFee()
  const platformFee = await contract.platformFee()

  console.log(`Protocol fee: ${ethers.utils.formatEther(protocolFee)} TRU`)
  console.log(`Platform fee: ${ethers.utils.formatEther(platformFee)} ETH`)
  console.log()

  console.log(`Allowing smart contract to spend our TRU tokens to pay protocol fees...`)
  console.log()
  const trutx = await tru.approve(contract.address, protocolFee.toString())
  await trutx.wait()

  const input = 'abc123'

  console.log(`Submitting task to reverse "${input}"`)
  const tx = await contract.reverse(ethers.utils.toUtf8Bytes(input), { value: platformFee.toString() })
  await tx.wait()

  console.log('Submitted')
  console.log()

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

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.toString())
    process.exit(1)
  })
