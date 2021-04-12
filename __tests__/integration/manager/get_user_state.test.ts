import {fakeMapping, setUp} from '../utils';
import {HistoryLocation} from '../../../src';

describe('Manager', () => {
    describe('getUserState', () => {
        it('returns the correct state of the filters currently applied', async () => {
            // Arrange
            const {manager} = setUp();
            await manager.getFieldNamesAndTypes();
            const fakeField = fakeMapping().boolean_field;
            const fakeState: HistoryLocation = {
                filters: {
                    exists: {
                        fieldKinds: {[fakeField]: 'should'},
                        fieldFilters: {[fakeField]: {exists: true}}
                    }
                }
            };

            // Act
            // First set the user state
            manager.setUserState(fakeState);
            // Get the resulting state
            const actualState = manager.getUserState();

            // Assert
            expect(actualState).toMatchObject(fakeState);
        });
    });
});
