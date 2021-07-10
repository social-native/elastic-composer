import {objKeys} from './utils';
import {
    ESMappingType,
    ESMappingPropertyType,
    ESMappingProperties,
    ESMapping,
    ESMapping710
} from './types';

export function isPropertyType(
    prop: ESMappingPropertyType | {properties: ESMappingProperties}
): prop is ESMappingPropertyType {
    return (prop as ESMappingPropertyType).type !== undefined;
}

export function hasProperities(prop: ESMappingPropertyType | {properties: ESMappingProperties}
    ): prop is { properties: ESMappingProperties } {
    return (prop as {properties: ESMappingProperties})?.properties !== undefined
}


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

    public static flattenMappings710(rawMappings: ESMapping710): Record<string, ESMappingType> {
        let flattenedMappings = {};
        Object.values(rawMappings).forEach(({mappings}) => {
            if (!mappings.properties) {
                return;
            }
            flattenedMappings = {
                ...flattenedMappings,
                ...MappingParser.flattenMappingProperty(mappings.properties)
            };
        });
        return flattenedMappings;
    }

    public static flattenMappingProperty = (
        mappingProperties: ESMappingProperties,
        parentFieldName: string | undefined = undefined
    ): Record<string, ESMappingType> => {
        return objKeys(mappingProperties).reduce<Record<string, ESMappingType>>((allProperties, fieldName) => {
            const property = mappingProperties[fieldName];
            const name = parentFieldName ? `${parentFieldName}.${fieldName}` : fieldName;
            // Add the type of the current field, if it has a type 
            if (isPropertyType(property)) {
                allProperties[name] = property.type
            } 
            // Recursively flatten all properties of this field
            if (hasProperities(property)) {
                const flattened = MappingParser.flattenMappingProperty(
                    property.properties,
                    name as string
                );
                Object.entries(flattened).forEach(([flattenedProperty, mappingType]) => {
                    allProperties[flattenedProperty] = mappingType;
                });
            }
            return allProperties;
        }, {});
    };
}
