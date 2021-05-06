import {objKeys} from './utils';
import {ESMappingType, ESMappingPropertyType, ESMappingProperties, ESMapping, ESMappingValue} from './types';

export function isPropertyType(
    prop: ESMappingPropertyType | {properties: ESMappingProperties}
): prop is ESMappingPropertyType {
    return (prop as ESMappingPropertyType).type !== undefined;
}

export default class MappingParser {
    public static flattenMappings = (
        rawMappings: ESMapping
    ): Record<string, ESMappingType> => {
        function isSpecificMapping(mappingValue: ESMappingValue): mapping is string {

        }
        return objKeys(rawMappings).reduce((allIndexes, indexName) => {
            const {mappings} = rawMappings[indexName];
            const flattenedSpecificIndex = objKeys(mappings).reduce((allMappings, mappingKey) => {
                const specificMapping = mappings[mappingKey];
                if (!isSpecificMapping(specificMapping)) {
                    return allMappings;
                }
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
