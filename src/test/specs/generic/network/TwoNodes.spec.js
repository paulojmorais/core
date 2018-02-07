describe('TwoNodes', () => {
    beforeEach(function () {
        jasmine.clock().install();
        MockNetwork.install();
    });

    afterEach(function () {
        jasmine.clock().uninstall();
        MockNetwork.uninstall();
    });

    it('should be able to connect and reach consensus', (done) => {
        (async function () {
            Log.instance.level = Log.DEBUG;

            const netconfig = new WsNetworkConfig('45.79.196.31', 9000, 'key1', 'cert1');
            const consensus = await Consensus.volatile(netconfig);

            PeerAddresses.SEED_PEERS = [WsPeerAddress.seed('45.79.196.31', 9000)];

            const consensus2 = await Consensus.volatile();
            const network2 = consensus2.network;

            network2.connect();
            jasmine.clock().tick(1500);

        })().then(done).catch(done.fail);
    });
});
