
const fs = require('fs');
const path = require('path');

const webpack = require('webpack');

const packageJson = require('../package.json');

const LIBRARY_NAME = 'js-synthesizer';
const LIBRARY_FILENAME = 'js-synthesizer';
const LIBRARY_NAMESPACE = 'JSSynth';
const OLD_LIBRARY_NAME = 'fluid-js';
const OLD_LIBRARY_FILENAME = 'fluid';
const OLD_LIBRARY_NAMESPACE = 'Fluid';
const LIBRARY_VERSION = packageJson.version;
const AUTHOR = packageJson.author;

const isMinified = process.env.NODE_ENV === 'minified';
const suffix = isMinified ? '.min' : '';

const headerTextTemplate = fs.readFileSync(path.resolve(__dirname, '../src/banner/header.txt'), 'utf8');
const preparedHeaderText = prependHeaderTextImpl(
	LIBRARY_NAME, AUTHOR, LIBRARY_VERSION
);

const webpackConfBase = {
	mode: isMinified ? 'production' : 'development',
	devtool: 'source-map',
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: [
					{
						loader: 'ts-project-loader',
						options: {
							tempBuildDir: isMinified ? void (0) : path.resolve(__dirname, '../dist/lib'),
							compilerOptions: {
								declaration: !isMinified
							}
						}
					}
				]
			}
		]
	},
	optimization: {
		concatenateModules: true,
		namedModules: false
	},
	plugins: [
		new webpack.BannerPlugin({
			banner: preparedHeaderText,
			raw: true
		})
	],
	resolve: {
		extensions: ['.tsx', '.ts', '.js']
	}
};

module.exports = [
	Object.assign({
		entry: {
			[LIBRARY_FILENAME]: path.resolve(__dirname, '../src/main/index.ts')
		},
		output: {
			path: path.resolve(__dirname, '../dist'),
			filename: `[name]${suffix}.js`,
			libraryTarget: 'umd',
			library: {
				root: LIBRARY_NAMESPACE,
				amd: LIBRARY_NAMESPACE,
				commonjs: LIBRARY_NAME
			},
			globalObject: 'this'
		},
	}, webpackConfBase),
	Object.assign({
		entry: {
			[`${LIBRARY_FILENAME}.worklet`]: path.resolve(__dirname, '../src/main/workletEntry.ts')
		},
		output: {
			path: path.resolve(__dirname, '../dist'),
			filename: `[name]${suffix}.js`
		},
	}, webpackConfBase),
	// old library name (supported for compatibility; will be removed in the future)
	Object.assign({
		entry: {
			[OLD_LIBRARY_FILENAME]: path.resolve(__dirname, '../src/main/index.ts')
		},
		output: {
			path: path.resolve(__dirname, '../dist'),
			filename: `[name]${suffix}.js`,
			libraryTarget: 'umd',
			library: {
				root: OLD_LIBRARY_NAMESPACE,
				amd: OLD_LIBRARY_NAMESPACE,
				commonjs: OLD_LIBRARY_NAME
			},
			globalObject: 'this'
		},
	}, webpackConfBase),
	Object.assign({
		entry: {
			[`${OLD_LIBRARY_FILENAME}.worklet`]: path.resolve(__dirname, '../src/main/workletEntry.ts')
		},
		output: {
			path: path.resolve(__dirname, '../dist'),
			filename: `[name]${suffix}.js`
		},
	}, webpackConfBase)
];

/**
 * @param {number|string} num numeric data
 * @param {number} length minimum length
 * @return {string} converted string
 */
function toNumberStringWithZero(num, length) {
	num = num.toString();
	length -= num.length;
	if (length > 0)
		num = Array(length + 1).join('0') + num;
	return num;
}

function prependHeaderTextImpl(name, author, version) {
	var date = new Date();
	var s;
	return headerTextTemplate
		.replace('[name]', name)
		.replace('[author]', author)
		.replace('[version]', version || '')
		.replace('[year4]', toNumberStringWithZero(date.getFullYear(), 4))
		.replace(
			'[date]',
			toNumberStringWithZero(date.getFullYear(), 4) + '-' +
			toNumberStringWithZero(date.getMonth() + 1, 2) + '-' +
			toNumberStringWithZero(date.getDate(), 2)
		);
}
