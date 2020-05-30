const fs = require('fs');
const path = require('path');

const webpack = require('webpack');

const packageJson = require('../package.json');

const LIBRARY_NAME = 'js-synthesizer';
const LIBRARY_FILENAME = 'js-synthesizer';
const LIBRARY_NAMESPACE = 'JSSynth';
const LIBRARY_VERSION = packageJson.version;
const AUTHOR = packageJson.author;

const headerTextTemplate = fs.readFileSync(path.resolve(__dirname, '../src/banner/header.txt'), 'utf8');
const preparedHeaderText = prependHeaderTextImpl(
	LIBRARY_NAME, AUTHOR, LIBRARY_VERSION
);

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

module.exports = (env) => {
	const isMinified = !!(env && env.minified);
	const suffix = isMinified ? '.min' : '';

	const webpackConfBase = {
		mode: isMinified ? 'production' : 'development',
		devtool: 'source-map',
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					use: [
						{
							loader: 'ts-loader'
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

	return [
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
		}, webpackConfBase)
	];
};
