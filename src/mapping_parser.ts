import {objKeys} from './utils';
import {ESMappingType} from 'types';

type ESMappingPropertyType = {
    type: ESMappingType;
};
type ESMappingProperties = {
    [field: string]: ESMappingPropertyType | {properties: ESMappingProperties};
};

export function isPropertyType(
    prop: ESMappingPropertyType | {properties: ESMappingProperties}
): prop is ESMappingPropertyType {
    return (prop as ESMappingPropertyType).type !== undefined;
}

type ESMapping<Alias extends string> = {
    [index: string]: {
        mappings: {
            [alias in Alias]: {
                dynamic: string;
                _all: object;
                properties: ESMappingProperties;
            };
        };
    };
};
export default class MappingParser {
    public static flattenMappings = <Alias extends string>(
        rawMappings: ESMapping<Alias>
    ): Record<string, ESMappingType> => {
        return objKeys(rawMappings).reduce((allIndexes, indexName) => {
            const {mappings} = rawMappings[indexName];
            const flattenedSpecificIndex = objKeys(mappings).reduce((allMappings, alias) => {
                const specificMapping = mappings[alias];
                return {
                    ...allMappings,
                    ...MappingParser.flattenMappingProperty(specificMapping.properties)
                };
            }, {});
            return {
                ...allIndexes,
                ...flattenedSpecificIndex
            };
        }, {});
    };

    public static flattenMappingProperty = (
        mappingProperties: ESMappingProperties,
        parentFieldName: string | undefined = undefined
    ): Record<string, ESMappingType> => {
        return objKeys(mappingProperties).reduce((allProperties, fieldName) => {
            const property = mappingProperties[fieldName];
            const name = parentFieldName ? `${parentFieldName}.${fieldName}` : fieldName;
            if (isPropertyType(property)) {
                return {
                    ...allProperties,
                    [name]: property.type
                };
            } else {
                const flattened = MappingParser.flattenMappingProperty(
                    property.properties,
                    name as string
                );
                return {
                    ...allProperties,
                    ...flattened
                };
            }
        }, {});
    };
}
