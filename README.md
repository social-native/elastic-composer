# snpkg-client-template

Rollup for client side packages + Parcel for dev react app with styled components and typescript

To use:
1. Go to package.json and change `package-name` to repo name
2. Add any dependencies that are used in the built version to `peerDependencies`
3. Create your dev playground app in the `dev` folder
   - Reusable components go in the `app/components` folder. Export all components from the `app/components/index.ts` file
   - Features go in the `app/features` folder. Export all features from the `app/features/index.ts` file
   - State (mobx objects) go in the `app/state` folder. Export all state objects from the `app/state/index.ts` file
   - Context (mobx singletons aka datastores) go in the `app/context` file.
4. Create your package code in the `src` folder
5. Edit the `.github/CODEOWNERS` file with the github user names of the codeowners

Your README should have:

- table of contents
- install section
- about section
- api section
- example usage section
  


- [snpkg-client-template](#snpkg-client-template)
  - [Install](#install)
  - [About](#about)
  - [API](#api)
  - [Example Usage](#example-usage)

## Install

```
npm install --save @social-native/<NAME>
```

## About

<FILL ME IN>

## API

<FILL ME IN>

## Example Usage

<FILL ME IN>