import 'meteor/dburles:collection-helpers';
import { Promise } from 'meteor/promise';
import { ProductPricingDirector } from 'meteor/unchained:core-pricing';
import { WarehousingProviders } from 'meteor/unchained:core-warehousing';
import { DeliveryProviders } from 'meteor/unchained:core-delivery';
import { findLocalizedText } from 'meteor/unchained:core';
import { objectInvert, slugify } from 'meteor/unchained:utils';
import { Locale } from 'locale';
import crypto from 'crypto';
import {
  Products, ProductMedia, Media, ProductTexts,
  ProductMediaTexts, ProductVariations, ProductVariationTexts,
} from './collections';
import { ProductStatus, ProductTypes } from './schema';

Products.createProduct = ({
  authorId, locale, title, type, ...rest
}, { autopublish = false } = {}) => {
  const product = {
    created: new Date(),
    authorId,
    type: ProductTypes[type],
    status: ProductStatus.DRAFT,
    sequence: Products.getNewSequence(),
    ...rest,
  };
  const productId = Products.insert(product);
  const productObject = Products.findOne({ _id: productId });
  productObject.upsertLocalizedText({ locale, title });
  if (autopublish) {
    productObject.publish();
  }
  return productObject;
};

Products.updateProduct = ({ productId, ...product }) => {
  Products.update({ _id: productId }, {
    $set: {
      ...product,
      updated: new Date(),
    },
  });
  return Products.findOne({ _id: productId });
};

Products.getNewSequence = (oldSequence) => {
  const sequence = (oldSequence + 1) || (Products.find({}).count() * 10);
  if (Products.find({ sequence }).count() > 0) {
    return Products.getNewSequence(sequence);
  }
  return sequence;
};

export default () => {
  const { Users } = Promise.await(import('meteor/unchained:core-users'));
  const { Countries } = Promise.await(import('meteor/unchained:core-countries'));
  const { AssortmentProducts } = Promise.await(import('meteor/unchained:core-assortments'));

  Products.helpers({
    publish() {
      switch (this.status) {
        case ProductStatus.DRAFT:
          Products.update({ _id: this._id }, {
            $set: {
              status: ProductStatus.ACTIVE,
              updated: new Date(),
              published: new Date(),
            },
          });
          return true;
        default:
          return false;
      }
    },
    unpublish() {
      switch (this.status) {
        case ProductStatus.ACTIVE:
          Products.update({ _id: this._id }, {
            $set: {
              status: ProductStatus.DRAFT,
              updated: new Date(),
              published: null,
            },
          });
          return true;
        default:
          return false;
      }
    },
    upsertLocalizedText({
      locale, title, slug: propablyUsedSlug, ...rest
    }) {
      const slug = ProductTexts
        .getUnusedSlug(propablyUsedSlug || title || this._id, {
          productId: { $ne: this._id },
        }, !!propablyUsedSlug);

      ProductTexts.upsert({
        productId: this._id,
        locale,
      }, {
        $set: {
          updated: new Date(),
          title,
          locale,
          slug,
          ...rest,
        },
      }, { bypassCollection2: true });

      Products.update({
        _id: this._id,
      }, {
        $set: {
          updated: new Date(),
        },
        $addToSet: {
          slugs: slug,
        },
      });
      return ProductTexts.findOne({ productId: this._id, locale });
    },
    addMediaLink({ mediaId, meta }) {
      const sortKey = ProductMedia.getNewSortKey(this._id);
      const productMediaId = ProductMedia.insert({
        mediaId,
        tags: [],
        sortKey,
        productId: this._id,
        created: new Date(),
        meta,
      });
      const productMediaObject = ProductMedia.findOne({ _id: productMediaId });
      return productMediaObject;
    },
    addMedia({
      rawFile, href, name, userId, meta, ...options
    }) {
      const fileLoader = rawFile ? Media.insertWithRemoteBuffer({
        file: rawFile,
        userId,
      }) : Media.insertWithRemoteURL({
        url: href,
        fileName: name,
        userId,
        ...options,
      });
      const file = Promise.await(fileLoader);
      return this.addMediaLink({ mediaId: file._id, meta });
    },
    getLocalizedTexts(locale) {
      const parsedLocale = new Locale(locale);
      return Products.getLocalizedTexts(this._id, parsedLocale);
    },
    normalizedStatus() {
      return objectInvert(ProductStatus)[this.status];
    },
    media() {
      return ProductMedia.find({ productId: this._id }, { sort: { sortKey: 1 } }).fetch();
    },
    variations() {
      return ProductVariations.find({ productId: this._id }).fetch();
    },
    variation(key) {
      return ProductVariations.findOne({ productId: this._id, key });
    },
    proxyAssignments() {
      return ((this.proxy && this.proxy.assignments) || []).map(assignment => ({
        assignment,
        product: this,
      }));
    },
    proxyProducts(vectors) {
      const { proxy = { } } = this;
      let filtered = [...(proxy.assignments || [])];
      vectors.forEach(({ key, value }) => {
        filtered = filtered.filter((assignment) => {
          if (assignment.vector[key] === value) {
            return true;
          }
          return false;
        });
      });
      const productIds = filtered.map(filteredAssignment => filteredAssignment.productId);
      return Products.find({ _id: { $in: productIds } }).fetch();
    },

    userDispatches({
      deliveryProviderType, ...options
    }) {
      const deliveryProviders = DeliveryProviders.find({ type: deliveryProviderType }).fetch();
      return deliveryProviders.reduce(
        (oldResult, deliveryProvider) => oldResult
          .concat(oldResult, WarehousingProviders.findSupported({ product: this, deliveryProvider })
            .map((warehousingProvider) => {
              const context = {
                warehousingProvider,
                deliveryProvider,
                product: this,
                ...options,
              };
              const dispatch = warehousingProvider.estimatedDispatch(context);
              return {
                ...context,
                ...dispatch,
              };
            })),
        [],
      );
    },

    userStocks({
      deliveryProviderType, ...options
    }) {
      const deliveryProviders = DeliveryProviders.find({ type: deliveryProviderType }).fetch();
      return deliveryProviders.reduce(
        (oldResult, deliveryProvider) => oldResult
          .concat(oldResult, WarehousingProviders.findSupported({ product: this, deliveryProvider })
            .map((warehousingProvider) => {
              const context = {
                warehousingProvider,
                deliveryProvider,
                product: this,
                ...options,
              };
              const stock = warehousingProvider.estimatedStock(context);
              return {
                ...context,
                ...stock,
              };
            })),
        [],
      );
    },

    userDiscounts(/* { quantity, country, userId } */) {
      // TODO: User Discount Simulation
      return [];
    },

    userPrice({
      quantity = 1, country, userId, useNetPrice,
    }) {
      const currency = Countries.resolveDefaultCurrencyCode({
        isoCode: country,
      });
      const user = Users.findOne({ _id: userId });
      const pricingDirector = new ProductPricingDirector({
        product: this,
        user,
        country,
        currency,
        quantity,
      });
      pricingDirector.calculate();
      const pricing = pricingDirector.resultSheet();
      const userPrice = pricing.unitPrice({ useNetPrice });

      return {
        _id: crypto
          .createHash('sha256')
          .update([this._id, country, quantity, useNetPrice, userId || 'ANONYMOUS'].join(''))
          .digest('hex'),
        amount: userPrice.amount,
        currencyCode: userPrice.currency,
        countryCode: country,
        isTaxable: (pricing.taxSum() > 0),
        isNetPrice: useNetPrice,
      };
    },
    price({ country, quantity = 1 }) {
      const currency = Countries.resolveDefaultCurrencyCode({
        isoCode: country,
      });
      const pricing = ((this.commerce && this.commerce.pricing) || [])
        .sort(({ maxQuantity: leftMaxQuantity = 0 },
          { maxQuantity: rightMaxQuantity = 0 }) => {
          if (leftMaxQuantity === rightMaxQuantity
            || (!leftMaxQuantity && !rightMaxQuantity)) return 0;
          if (leftMaxQuantity === 0) return -1;
          if (rightMaxQuantity === 0) return 1;
          return leftMaxQuantity - rightMaxQuantity;
        });
      return pricing
        .reduce((oldValue, curPrice) => {
          if (curPrice.currencyCode === currency
          && curPrice.countryCode === country
          && (!curPrice.maxQuantity || curPrice.maxQuantity >= quantity)) {
            return {
              ...oldValue,
              ...curPrice,
            };
          }
          return oldValue;
        }, {
          _id: crypto
            .createHash('sha256')
            .update([this._id, country, currency].join(''))
            .digest('hex'),
          amount: 0,
          currencyCode: currency,
          countryCode: country,
          isTaxable: false,
          isNetPrice: false,
        });
    },
    siblings({ assortmentId } = {}) {
      const assortmentIds = assortmentId
        ? [assortmentId]
        : AssortmentProducts
          .find({ productId: this._id })
          .fetch()
          .map(({ assortmentId: id }) => id);
      if (!assortmentIds || assortmentIds.length === 0) return [];
      const productIds = AssortmentProducts
        .find({
          $and: [{
            productId: { $ne: this._id },
          }, {
            assortmentId: { $in: assortmentIds },
          }],
        })
        .fetch()
        .map(({ productId: curProductId }) => curProductId);
      return Products
        .find({ _id: { $in: productIds } })
        .fetch();
    },
  });
};

ProductMedia.helpers({
  upsertLocalizedText({ locale, ...rest }) {
    const localizedData = { locale, ...rest };
    ProductMediaTexts.upsert({
      productMediaId: this._id,
      locale,
    }, {
      $set: {
        updated: new Date(),
        ...localizedData,
      },
    }, { bypassCollection2: true });
    return ProductMediaTexts.findOne({ productMediaId: this._id, locale });
  },
  getLocalizedTexts(locale) {
    const parsedLocale = new Locale(locale);
    return ProductMedia.getLocalizedTexts(this._id, parsedLocale);
  },
  file() {
    const media = Media.findOne({ _id: this.mediaId });
    return media;
  },
});

ProductVariations.helpers({
  upsertLocalizedText({ locale, productVariationOptionValue, ...rest }) {
    const localizedData = { locale, ...rest };
    const selector = {
      productVariationId: this._id,
      productVariationOptionValue: productVariationOptionValue || { $eq: null },
      locale,
    };
    ProductVariationTexts.upsert(selector, {
      $set: {
        updated: new Date(),
        ...localizedData,
        productVariationOptionValue: productVariationOptionValue || null,
      },
    }, { bypassCollection2: true });
    return ProductVariationTexts.findOne(selector);
  },
  getLocalizedTexts(locale, optionValue) {
    const parsedLocale = new Locale(locale);
    return ProductVariations.getLocalizedTexts(this._id, optionValue, parsedLocale);
  },
  optionObject(productVariationOption) {
    return {
      productVariationOption,
      getLocalizedTexts: this.getLocalizedTexts,
      ...this,
    };
  },
});

Products.getLocalizedTexts = (
  productId,
  locale,
) => findLocalizedText(ProductTexts, { productId }, locale);

ProductMedia.getLocalizedTexts = (
  productMediaId,
  locale,
) => findLocalizedText(ProductMediaTexts, { productMediaId }, locale);

ProductTexts.getUnusedSlug = (strValue, scope, isAlreadySlugified) => {
  const slug = isAlreadySlugified ? strValue : `${slugify(strValue)}`;
  if (ProductTexts.find({ ...scope, slug }).count() > 0) {
    return ProductTexts.getUnusedSlug(`${slug}-`, scope, true);
  }
  return slug;
};

ProductVariations.getLocalizedTexts = (
  productVariationId,
  productVariationOptionValue,
  locale,
) => findLocalizedText(ProductVariationTexts, {
  productVariationId,
  productVariationOptionValue: productVariationOptionValue || { $eq: null },
}, locale);

ProductMedia.getNewSortKey = (productId) => {
  const lastProductMedia = ProductMedia.findOne({
    productId,
  }, {
    sort: { sortKey: 1 },
  }) || { sortKey: 0 };
  return lastProductMedia.sortKey + 1;
};
