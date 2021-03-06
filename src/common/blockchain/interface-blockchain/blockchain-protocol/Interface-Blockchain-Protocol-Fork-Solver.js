import NodesList from 'node/lists/nodes-list'
import InterfaceBlockchainBlockCreator from "../blocks/Interface-Blockchain-Block-Creator";
import InterfaceBlockchainFork from "../blockchain/forks/Interface-Blockchain-Fork";
import BlockchainMiningReward from 'common/blockchain/global/Blockchain-Mining-Reward'
const colors = require('colors/safe');

/**
 * Blockchain Protocol Fork Solver - that solves the fork of a new blockchain
 */
class InterfaceBlockchainProtocolForkSolver{

    constructor(blockchain){

        this.blockchain = blockchain;

    }

    async _discoverForkBinarySearch(sockets, left, right){

        let blockHeaderResult;

        try {

            let socket = sockets[0];

            let mid = Math.trunc((left + right) / 2);

            blockHeaderResult = await socket.node.sendRequestWaitOnce("blockchain/headers/request-block-by-height", {height: mid}, mid);

            if (!blockHeaderResult.result || blockHeaderResult.header === undefined || blockHeaderResult.header.hash === undefined) return {position: -1, header: blockHeaderResult.header};

            //i have finished the binary search
            if (left >= right) {
                //it the block actually is the same
                if (blockHeaderResult.header.hash.equals(this.blockchain.blocks[mid].hash) )
                    return {position: mid, header: blockHeaderResult.header};
                else
                    return {position: -1, header: blockHeaderResult.header};
            }

            //was not not found, search left because it must be there
            if (blockHeaderResult.header.hash.equals(this.blockchain.blocks[mid].hash) === false)
                return this._discoverForkBinarySearch(sockets, left, mid);
            else
            //was found, search right because the fork must be there
                return this._discoverForkBinarySearch(sockets, mid + 1, right);


        } catch (Exception){

            console.log(colors.red("_discoverForkBinarySearch raised an exception" ), Exception, blockHeaderResult)

        }

    }

    /*
        may the fork be with you Otto
     */
    async discoverAndSolveFork(sockets, newChainLength, header){

        if (!Array.isArray(sockets)) sockets = [sockets];

        try{

            let forkFound = this.blockchain.forksAdministrator.findForkBySockets(sockets);
            if ( forkFound !== null ) return forkFound;


            let data = {position: -1, header: null };
            let currentBlockchainLength = this.blockchain.getBlockchainLength();

            //check if n-2 was ok, but I need at least 1 block
            if (currentBlockchainLength <= newChainLength && currentBlockchainLength-2  >= 0 && currentBlockchainLength > 0){

                let answer = await sockets[0].node.sendRequestWaitOnce("blockchain/headers/request-block-by-height", { height: currentBlockchainLength-2 }, currentBlockchainLength-2 );

                //console.log(" !!!! answer", answer);

                if (answer.result === true && answer.header !== undefined) {

                    if (answer.header.hash.equals( this.blockchain.getBlockchainLastBlock().hash )) {
                        data = {
                            position : currentBlockchainLength - 1,
                            header: answer.header,
                        };
                    }
                }

            }

            // in case it was you solved previously && there is something in the blockchain

            if ( data.position === -1 && currentBlockchainLength > 0 ) {
                data = await this._discoverForkBinarySearch(sockets, 0, currentBlockchainLength - 1);
                //console.log("binary search ", data)
            }

            // it has a ground-new blockchain
            // very skeptical when the blockchain becomes bigger
            if (data.position === -1 && currentBlockchainLength < newChainLength){
                let answer = await sockets[0].node.sendRequestWaitOnce("blockchain/headers/request-block-by-height", { height: 0 }, 0 );
                if (answer.result === true && answer.header !== undefined)
                    data = {position: 0, header: answer.header};
            }

            //its a fork... starting from position
            console.log("fork position", data.position, "newChainLength", newChainLength);

            if (data.position === 0 || (data.position > 0 && data.header !== undefined && data.header !== null) ){

                let fork;

                try {

                    fork = await this.blockchain.forksAdministrator.createNewFork(sockets, data.position, newChainLength, data.header);

                } catch (Exception){
                    console.log(colors.red("discoverAndSolveFork - creating a fork raised an exception" + Exception.toString() ), "data", data )
                }

                if (fork === null) {
                    console.log("fork is null");
                    return null;
                }

                try{

                    // for (let i=0; i<100; i++)
                    //     console.log(colors.green("forks " + this.blockchain.forksAdministrator.forks.length) );

                    if (fork !== null)
                        this.solveFork(fork);

                    return fork;

                } catch (Exception){
                    console.log(colors.red("discoverAndSolveFork - solving a fork raised an exception" + Exception.toString() ), "data", data )
                }

            }
            //it is a totally new blockchain (maybe genesis was mined)
            console.log("fork is something new");

            return null;

        } catch (Exception){
            console.log(colors.red("discoverAndSolveFork raised an exception" + Exception.toString() ) )
        }

    }

    /**
     * Solve Fork by Downloading  the blocks required in the fork
     * @param fork
     * @returns {Promise.<boolean>}
     */
    async solveFork(fork){

        if (fork === null || !(fork instanceof InterfaceBlockchainFork) ) throw ('fork is null');

        let nextBlockHeight = fork.forkStartingHeight;

        let finished = false,
            socketsCheckedForBlock = [],
            terminateTimeout;

        //interval timer

        return new Promise((resolve)=>{

            let forkSolverInterval = setInterval(async ()=>{

                // check if the fork is finished
                if (finished || (fork.forkStartingHeight + fork.forkBlocks.length >= fork.forkChainLength )) {
                    clearInterval(forkSolverInterval);
                    clearTimeout(terminateTimeout);

                    if (fork.forkBlocks.length === fork.forkChainLength - fork.forkStartingHeight) {

                        //if the fork is successfully, the save it as the main blockchain
                        if (await fork.saveFork())
                            resolve(true);

                    }

                    resolve(false);
                    return;
                }

                //set no change, to terminate
                if (terminateTimeout === undefined)
                    terminateTimeout = setTimeout(()=>{
                        console.log(colors.red("Fork was not solved in time..."));
                        finished = true;
                    }, 20*1000);

                let socket = fork.sockets[ Math.floor(Math.random()*fork.sockets.length) ];

                //console.log("processsing... fork.sockets.length ", fork.sockets.length);

                //in case I didn't check this socket for the same block
                if ( socketsCheckedForBlock.indexOf(socket) < 0) {

                    //console.log("it worked ", socket);

                    socketsCheckedForBlock.push(socket);
                    console.log("nextBlockHeight", nextBlockHeight);

                    socket.node.sendRequestWaitOnce("blockchain/blocks/request-block-by-height", { height: nextBlockHeight }, nextBlockHeight ).then( async (answer)=>{

                        //console.log("blockchain/blocks/request-block-by-height/",answer)

                        if (answer.result === true){

                            let block;

                            try {
                                block = this.blockchain.blockCreator.createEmptyBlock(nextBlockHeight);
                                block.deserializeBlock(answer.block, nextBlockHeight, BlockchainMiningReward.getReward(block.height), this.blockchain.getDifficultyTarget());


                            } catch (Exception){
                                console.log(colors.red("Error deserializing blocks " + Exception.toString()));
                                finished = true;
                                return false;
                            }

                            let result;
                            try {
                                result = await fork.includeForkBlock(block);
                            } catch (Exception){
                                console.log(block.serializeBlock().toString("hex"));
                                console.log(colors.red("Error including block "+nextBlockHeight+" in fork " + Exception.toString()));
                                finished = true;
                                return false;
                            }

                            //if the block was included correctly
                            if (result) {
                                clearTimeout(terminateTimeout);
                                terminateTimeout = undefined;
                                nextBlockHeight++;

                                socketsCheckedForBlock = [];
                            }

                        }

                    })
                }



            });


        });

    }

}


export default InterfaceBlockchainProtocolForkSolver;