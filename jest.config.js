module.exports = {
    roots: ['<rootDir>/src', '<rootDir>/__tests__'],
    transform: {
        '^.+\\.ts$': 'ts-jest'
    },
    automock: false,
    moduleFileExtensions: ['ts', 'js', 'json'],
    modulePaths: ['<rootDir>/src', '<rootDir>/__tests__'],
    testRegex: '(/__tests__/.*|(\\.|/))test.ts?$'
};
