import {ESRequest, ESResponse, IClient, ESMappingType} from '../types';
import {decorate, observable, runInAction} from 'mobx';
import axios from 'axios';
import MappingParser from '../mapping_parser';

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

    public search = async (request: ESRequest): Promise<ESResponse<Source>> => {
        const {data} = await axios.get(`${this.endpoint}/_search`, {
            params: {
                source: JSON.stringify(request),
                source_content_type: 'application/json'
            }
        });
        return data;
    };

    public mapping = async (): Promise<Record<string, ESMappingType>> => {
        const {data} = await axios.get(`${this.endpoint}/_mapping`);
        return MappingParser.flattenMappings(data);
    };
}

decorate(AxiosClient, {
    endpoint: observable
});

export default AxiosClient;
