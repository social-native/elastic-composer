// import {runInAction} from 'mobx';
// import {ESRequest, ESRequestSortField, ESResponse} from 'types';

// class Paginator {
//     public currentPage: number;
//     public pageCursorInfo: Record<number, ESRequestSortField>;

//     constructor() {
//         runInAction(() => {
//             this.pageCursorInfo = {};
//             this.currentPage = 1;
//         });
//     }

//     public incrementPage = () => {
//         runInAction(() => {
//             this.currentPage = this.currentPage + 1;
//         });
//     };

//     public decrementPage = () => {
//         if (this.currentPage < 1) {
//             throw new Error('Can not decrement page below 1');
//         }
//         runInAction(() => {
//             this.currentPage = this.currentPage + 1;
//         });
//     };

//     public addNextPageCursorInfoToRequest = async (request: ESRequest) => {
//         const newRequest: ESRequest = {
//             ...BLANK_ES_REQUEST,
//             search_after: this.getCursorForNextPage()
//         };
//         await this.runFilterQuery(newRequest);
//         runInAction(() => {
//             this.currentPage = this.currentPage + 1;
//         });
//     };

//     public addPrevPageCursorInfoToRequest = async () => {
//         const newRequest: ESRequest = {
//             ...BLANK_ES_REQUEST,
//             search_after: this.getCursorForPreviousPage()
//         };
//         await this.runFilterQuery(newRequest);
//         runInAction(() => {
//             this.currentPage = this.currentPage - 1;
//         });
//     };

//     public getCursorForPreviousPage = (): ESRequestSortField => {
//         if (this.currentPage > 2) {
//             const cursorOfNextPage = this.pageCursorInfo[this.currentPage - 1];
//             if (!cursorOfNextPage) {
//                 throw new Error(`Missing cursor for page ${this.currentPage + 1}`);
//             }
//             return cursorOfNextPage;
//         } else if (this.currentPage === 2) {
//             return [];
//         } else {
//             throw new Error(`Cannot go to previous page from page ${this.currentPage}`);
//         }
//     };

//     public getCursorForNextPage = (): ESRequestSortField => {
//         const cursorOfNextPage = this.pageCursorInfo[this.currentPage + 1];
//         if (!cursorOfNextPage) {
//             throw new Error(`Missing cursor for page ${this.currentPage + 1}`);
//         }
//         return cursorOfNextPage;
//     };

//     public setCusorForNextPage = () => {
//         // console.log('SETTING cursor for next page', this.currentPage, toJS(this.pageCursorInfo));
//         runInAction(() => {
//             this.pageCursorInfo[this.currentPage + 1] = this.lastResultSort();
//         });
//     };

//     public lastResultSort = (): ESRequestSortField => {
//         return this.results[this.results.length - 1].sort;
//     };
// }
