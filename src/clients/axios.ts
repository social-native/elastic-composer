import {ESRequest, ESResponse, IClient} from '../types';
import {decorate, observable, runInAction} from 'mobx';
import axios from 'axios';

class AxiosClient<Source extends object = object> implements IClient {
    public endpoint: string;

    constructor(endpoint: string) {
        runInAction(() => {
            if (endpoint === undefined) {
                throw new Error('Elasticsearch endpoint is undefined');
            }
            this.endpoint = endpoint;
        });
    }

    public query = async (request: ESRequest): Promise<ESResponse<Source>> => {
        const {data} = await axios.get(this.endpoint, {
            params: {
                source: JSON.stringify(request),
                source_content_type: 'application/json'
            }
        });
        return data;
    };
}

decorate(AxiosClient, {
    endpoint: observable
});

export default AxiosClient;
