export const objKeys = <T extends {}>(o: T): Array<keyof T> => <Array<keyof T>>Object.keys(o); // tslint:disable-line
