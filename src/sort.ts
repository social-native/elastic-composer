import {decorate, observable, runInAction, computed} from 'mobx';

type ESSortOrderWithOptions = {
    [fieldName: string]: Omit<FieldSorting, 'field'>;
};
type ESSortOrder = Array<string | ESSortOrderWithOptions>;

type FieldSorting = {
    field: string;
    order?: 'asc' | 'desc';
    mode?: 'min' | 'max' | 'sum' | 'avg' | 'median';
    missing?: '_last' | '_first' | string;
};
class Sort {
    public sortOrder: FieldSorting[] = [];

    public _move = (from: number, to: number) => {
        runInAction(() => {
            this.sortOrder.splice(to, 0, this.sortOrder.splice(from, 1)[0]);
        });
    };

    public _currentPosition = (fieldName: string): number | undefined => {
        const position = this.sortOrder.findIndex(({field}) => field === fieldName);
        return position === -1 ? undefined : position;
    };

    public moveForward = (fieldName: string): void => {
        const position = this._currentPosition(fieldName);
        if (!position) {
            throw new Error(
                `Field cant be moved forward until it is added as a sortable field. Add it with the method 'addToSort'. For example: 'manager.sort.addToSort(${fieldName})'`
            );
        }
        if (position === 0) {
            return;
        }
        if (position > 0) {
            this._move(position, position - 1);
        }
    };

    public moveBackward = (fieldName: string): void => {
        const position = this._currentPosition(fieldName);
        if (!position) {
            throw new Error(
                `Field cant be moved backward until it is added as a sortable field. Add it with the method 'addToSort'. For example: 'manager.sort.addToSort(${fieldName})'`
            );
        }
        if (position === 0) {
            return;
        } else {
            this._move(position, position + 1);
        }
    };

    public addToSort = (fieldName: string, options?: Omit<FieldSorting, 'field'>): void => {
        const position = this._currentPosition(fieldName);

        runInAction(() => {
            if (position !== undefined) {
                this.removeFromSort(fieldName);
            }
            this.sortOrder = [...this.sortOrder, {...options, field: fieldName}];
        });
    };

    public removeFromSort = (fieldName: string) => {
        const position = this._currentPosition(fieldName);

        if (position !== undefined) {
            runInAction(() => {
                this.sortOrder.splice(position, 1);
            });
        } else {
            throw new Error(
                `Can't remove the field  ${fieldName} from the sort order because it has yet to be added.  Add the field to the sort order using the 'addToSort' method. For example: 'manager.sort.addToSort(${fieldName})'`
            );
        }
    };

    public get esSortOrder(): ESSortOrder {
        return this.sortOrder.reduce((acc, fieldSortInfo) => {
            const {field, ...options} = fieldSortInfo;
            if (Object.keys(options || {}).length > 0) {
                acc.push({[field]: options});
            } else {
                acc.push(field);
            }
            return acc;
        }, [] as ESSortOrder);
    }

    public clear = () => {
        runInAction(() => {
            this.sortOrder = [];
        });
    };
}

decorate(Sort, {
    sortOrder: observable,
    esSortOrder: computed
});

export default Sort;
