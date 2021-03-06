import InterfaceBlockchainMining from "./Interface-Blockchain-Mining";
import InterfaceBlockchainMiningWorkersList from "./Interface-Blockchain-Mining-Workers-List";

class InterfaceBlockchainMiningWorkers extends InterfaceBlockchainMining {

    constructor(blockchain, minerAddress){

        super(blockchain, minerAddress);

        this._workerFinished = false;

        this._workerResolve = undefined;
        this._workersSempahore = false;

        this.block = null;

        this.WORKER_NONCES_WORK = 47;

        this.workers = new InterfaceBlockchainMiningWorkersList(this);
    }


    mine(block, difficultyTarget){

        if (typeof block === 'object' && block.computedBlockPrefix !== undefined)
            block = block.computedBlockPrefix;

        this.block = block;
        this.difficulty = difficultyTarget;

        this._workerFinished = false;

        let promiseResolve = new Promise ((resolve)=>{ this._workerResolve = resolve });

        //initialize new workers

        console.log("init mining workers");

        this.workers.initializeWorkers(block, difficultyTarget );

        console.log("init mining workers done");

        return promiseResolve;
    }


    _getWorker(){
        return null;
    }


    _suspendMiningWorking(){

        this._workerFinished = true;

    }

    async setWorkers(newWorkers){
        if (newWorkers > this.workers.workers)
            await this.increaseWorkers(newWorkers - this.workers.workers )
        else
            await this.decreaseWorkers(- (newWorkers - this.workers.workers)  )
    }

    async increaseWorkers(number){

        if (number === 0) return;

        console.log("number", number);

        this.workers.addWorkers(number);

        if (!this.started && this.workers.workers > 0) await this.startMining();

        this.workers.createWorkers();


    }

    async decreaseWorkers(number){

        if (number === 0) return;

        console.log("number", number);

        this.workers.addWorkers(-number);

        this.workers.reduceWorkers();

        if (this.workers.workers === 0)
            await this.stopMining();
    }

    async startMining(){

        InterfaceBlockchainMining.prototype.startMining.call(this);

        if (this.workers.workers === 0)
            await this.setWorkers(1);
    }

    async stopMining(){

        InterfaceBlockchainMining.prototype.stopMining.call(this);

        if (this.workers.workers !== 0)
            await this.setWorkers(0);

        this.checkFinished();

    }

    checkFinished(){

        if (this._nonce > 0xFFFFFFFF || (this.started === false) || this.reset){

            this._processWorkersSempahoreCallback(()=>{

                this.workers.suspendWorkers();
                this._suspendMiningWorking();

                this._workerResolve({result:false}); //we didn't find anything

            });

        }
    }

    _puzzleReceived(worker, event){

        if (this._workerFinished) return; //job finished

        this.checkFinished();

        if (event.data.message === "algorithm"){

            console.log("algorithm information", event.data.answer);

            if (event.data.answer === "WebAssembly supported" || event.data.answer === "ASM.JS supported" ){

                if (event.data.answer === "ASM.JS supported")
                    this.blockchain.emitter.emit("blockchain/compatibility", {type: "MINING", message: "Your browser doesn't support WebAssembly. Install Chrome and your mining will increase with 70% more."});

                this.workers._initializeWorker( worker );

            } else { // Argon2 is not supported in Browser

                this.blockchain.emitter.emit("blockchain/compatibility", {type: "MINING", message: "Mining is not available on your machine. Please update your browser"})

                this.stopMining();
            }

        } else
        if (event.data.message === "error"){

        }
        else
        if (event.data.message === "results") {

            console.log("REEESULTS!!!", event.data, worker.suspended);

            if ( worker.suspended )
                return; //I am no longer interested

            if (event.data.hash === undefined){
                console.log("Worker Error");
            } else{

                //verify block with the worker block
                let match = true;

                for (let i=0; i<this.block.length; i++)
                    if (this.block[i] !== event.data.block[i] ) // do not match
                        match = false;

                //verify the  bestHash with  the current target
                if (match)
                    for (let i = 0, l=event.data.hash.length; i < l; i++)

                        if (event.data.hash[i] < this.difficulty[i] ) {

                            this._processWorkersSempahoreCallback( ()=>{

                                console.log('processing');

                                this._suspendMiningWorking();
                                this.workers.suspendWorkers();

                                this._workerResolve({
                                    result: true,
                                    hash: new Buffer(event.data.hash),
                                    nonce: event.data.nonce,
                                });

                            });

                            return;

                        } else if (event.data.hash[i] > this.difficulty[i] ) break;
            }

            if ( worker.suspended )
                return; //I am no longer interested

            worker.postMessage({message: "new-nonces", nonce: this._nonce, count: this.WORKER_NONCES_WORK});

            this._nonce += this.WORKER_NONCES_WORK;
            this._hashesPerSecond += this.WORKER_NONCES_WORK;

        } else
        if (event.data.message === "log") {
            console.log("worker", event.data.log);
        }

    }

    _processWorkersSempahoreCallback(callback){

        return new Promise ((resolve) =>{

            let timer = setInterval( async () => {

                if ( this._workersSempahore === false ){

                    this._workersSempahore = true;
                    clearInterval(timer);

                    try {
                        // solved by somebody else
                        if (this._workerResolve === undefined || this._workerFinished){
                            this._workersSempahore = false;
                            resolve(false);
                            return;
                        }

                        let result = await callback();
                        this._workersSempahore = false;

                        resolve(result);
                    } catch (exception){
                        this._workersSempahore = false;
                        console.log("_processWorkersSempahoreCallback Error", exception);
                        resolve(false);
                        throw exception;
                    }
                }
            },10);
        });

    }

}

export default InterfaceBlockchainMiningWorkers;