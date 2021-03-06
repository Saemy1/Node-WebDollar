import consts from 'consts/const_global'

class PPoWHelper{


    /**
     * LCA between too proofs
     */

    LCA(proofs1, proofs2){

        //LCA(C1, C2) = (C1 ∩ C2)[−1] π

        let i1 = proofs1.length - 1;
        let i2 = proofs2.length - 1;
        while (i1 >= 0 && i2 >= 0) {
            const block1 = proofs1.blocks[i1];
            const block2 = proofs2.blocks[i2];

            if (block1.equals(block2)) {
                return block1;
            } else if (block1.height > block2.height) {
                i1--;
            } else {
                i2--;
            }
        }
        return null;

    }


}

export default new PPoWHelper();