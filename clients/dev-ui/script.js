class DevUI {
    constructor(el, $) {
        this.$el = el;
        this.$ = $;
        this._accountsUi = new AccountsUi(this.$el.querySelector('[accounts-ui]'), $);
        this._accountInfoUi = new AccountInfoUi(this.$el.querySelector('[account-info-ui]'), $);
        this._transactionUi = new TransactionUi(this.$el.querySelector('[transaction-ui]'), $);
        this._blockchainUi = new BlockchainUi(this.$el.querySelector('[blockchain-ui]'), $);
        this._mempoolUi = new MempoolUi(this.$el.querySelector('[mempool-ui]'), $);
        this._networkUi = new NetworkUi(this.$el.querySelector('[network-ui]'), $);
        this._minerUi = new MinerUi(this.$el.querySelector('[miner-ui]'), $);

        this._accountsUi.on('account-selected', address => this._accountInfoUi.address = address);
        this._transactionUi.on('contract-created', address => this._accountsUi.addAccount(address));
    }
}
DevUI.CLIENT_NANO = 'nano';
DevUI.CLIENT_LIGHT = 'light';
DevUI.CLIENT_FULL = 'full';

// Safari quirks: don't use the same var name in global scope as id of html element
var overlay_ = document.querySelector('#overlay');

function loadScript(scriptSrc) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.addEventListener('load', resolve);
        script.addEventListener('error', reject);
        setTimeout(reject, 10000);
        script.src =scriptSrc;
        document.body.appendChild(script);
    });
}

function loadUi($) {
    const scripts = ['Utils.js', 'BlockchainUi.js', 'AccountInfoUi.js', 'TransactionUi.js', 'MempoolUi.js',
        'MinerUi.js', 'NetworkUi.js', 'AccountsUi.js'];
    const promises = [];
    scripts.forEach(script => {
        promises.push(loadScript(script));
    });
    Promise.all(promises)
        .then(() => window.ui = new DevUI(document.getElementById('content'), $))
        .catch(e => alert('Failed to load UI.' + (e? ' Error: ' + e.message : '')));
}

function startNimiq() {
    var clientType = location.hash.substr(1);
    if (clientType!==DevUI.CLIENT_NANO && clientType!==DevUI.CLIENT_LIGHT && clientType!==DevUI.CLIENT_FULL) {
        alert('Please navigate to /#nano, /#light or /#full to select a client type.');
        return;
    }
    document.body.setAttribute('client', clientType);

    Nimiq.init(async function() { // TODO remove async await
        const $ = {};
        window.$ = $;
        $.clientType = clientType;
        $.consensus = await Nimiq.Consensus[clientType]();

        // XXX Legacy API
        $.blockchain = $.consensus.blockchain;
        $.mempool = $.consensus.mempool;
        $.network = $.consensus.network;

        // XXX Legacy components
        $.walletStore = await new Nimiq.WalletStore();
        $.wallet = await $.walletStore.getDefault();

        if (clientType !== DevUI.CLIENT_NANO) {
            $.accounts = $.blockchain.accounts;
            $.miner = new Nimiq.Miner($.blockchain, $.mempool, $.accounts, $.network.time, $.wallet.address);
        } else {
            $.consensus.subscribeAccounts([$.wallet.address]);
        }

        $.network.connect();

        overlay_.style.display = 'none';
        loadUi($); // load UI after Core as some classes extend Nimiq.Observable
    }, function(code) {
        switch (code) {
            case Nimiq.ERR_WAIT:
                overlay_.style.display = 'block';
                break;
            case Nimiq.ERR_UNSUPPORTED:
                alert('Browser not supported');
                break;
            default:
                alert('Nimiq initialization error');
                break;
        }
    });
}

startNimiq();
