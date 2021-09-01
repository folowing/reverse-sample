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
