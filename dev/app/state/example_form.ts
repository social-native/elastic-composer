import {decorate, observable, action, runInAction, computed} from 'mobx';

export interface IConfig {
    formInputOne: string;
    formInputTwo: string;
}

const DEFAULT_CONFIG: IConfig = {
    formInputOne: 'hello',
    formInputTwo: 'world'
};

class ExampleForm {
    public formInputOne: IConfig['formInputOne'] | undefined;
    public formInputTwo: IConfig['formInputTwo'] | undefined;

    constructor(config?: Partial<IConfig>) {
        const c = {...DEFAULT_CONFIG, ...config};
        runInAction(() => {
            this.formInputOne = c.formInputOne;
            this.formInputTwo = c.formInputTwo;
        });
    }

    public setFormInputOne = (input: string) => {
        this.formInputOne = input;
    };

    public setFormInputTwo = (input: string) => {
        this.formInputTwo = input;
    };

    public get hasInput() {
        return this.formInputOne && this.formInputTwo;
    }
}
decorate(ExampleForm, {
    formInputOne: observable,
    formInputTwo: observable,
    setFormInputOne: action,
    setFormInputTwo: action,
    hasInput: computed
});

export default ExampleForm;
