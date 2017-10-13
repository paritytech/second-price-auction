# Whitelabel Second Price Auction Dapp.

## Test Contracts

* Install latest version of Node.js using Node Version Manager (NVM). Update NPM
    ```
    nvm install 8.7.0; nvm alias default 8.7.0; npm install -g npm;
    ```

* Install Truffle Beta (with Solidity v0.4.17) and Ethereum TestRPC
    ```
    npm uninstall -g truffle;
    npm install -g truffle@beta ethereumjs-testrpc; truffle version;
    ```

* Run the EthereumJS TestRPC in a separate Terminal window
    ```
    testrpc;
    ```

* Upgrade Contract Artifacts
    ```
    cd src; truffle compile --compile-all; cd ..;
    ```

* Migrate using Ethereum TestRPC
    ```
    cd src; truffle migrate --reset --network development; cd ..;
    ```

* Run Tests
    ```
    cd src; truffle test; cd ..;
    ```

* Install front-end NPM dependencies
    ```
    $ npm install
    $ npm install -g webpack
    ```

## Build Front-end Dapp

* Build front-end
    ```
    webpack --watch
    ```

    * Note: Files will be built into `dist/`. Just symlink that dir into your dapps path.

## Run Front-end Dapp

* Open the Dapp in your browser:
    ```
    open -a "Google Chrome" dist/index.html
    ```

## Debug Front-end Dapp

* View JavaScript errors in web browser
(i.e. in Google Chrome go to View > Developer > JavaScript Console)
