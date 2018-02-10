class Utils {
    static getAccount($, address) {
        if ($.clientType !== DevUI.CLIENT_NANO) {
            return $.accounts.get(address);
        } else {
            return $.consensus.getAccount(address); // TODO can fail
        }
    }

    static broadcastTransaction($, tx) {
        if ($.clientType !== DevUI.CLIENT_NANO) {
            $.mempool.pushTransaction(tx);
        } else {
            $.consensus.relayTransaction(tx); // TODO can fail
        }
    }

    static humanBytes(bytes) {
        var i = 0;
        var units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        while (bytes > 1024) {
            bytes /= 1024;
            i++;
        }
        return (Number.isInteger(bytes) ? bytes : bytes.toFixed(2)) + ' ' + units[i];
    }

    static toFixedPrecision(value, precision) {
        precision = precision === undefined? Math.log10(Nimiq.Policy.SATOSHIS_PER_COIN) : precision;
        return value.toFixed(precision);
    }
}
